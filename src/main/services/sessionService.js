const {
  IPC_CHANNELS,
  buildSessionDataEvent,
  buildSessionExitEvent,
} = require("../../shared/ipcContract");
const { appendBoundedBuffer } = require("./boundedBuffer");

const OUTPUT_FLUSH_INTERVAL_MS = 16;

function createSessionService({
  sessions,
  pty,
  sendToRenderer,
  buildPtyEnv,
  splitArgs,
  spawnSessionPty,
  persistenceService,
  manualTerminalService,
  diagnosticsService = null,
}) {
  function createSessionId() {
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  function buildSessionSummary(session) {
    return {
      id: session.id,
      label: session.label || "",
      cwd: session.cwd,
      command: session.command,
      args: session.args,
      outputBuffer: session.outputBuffer,
      isRunning: session.isRunning,
      createdAt: session.createdAt,
      endedAt: session.endedAt || null,
      exitCode: session.exitCode,
      signal: session.signal,
    };
  }

  function listSessions() {
    return Array.from(sessions.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(buildSessionSummary);
  }

  function publishSessionsChanged() {
    sendToRenderer(IPC_CHANNELS.events.sessionsChanged, listSessions());
  }

  function flushSessionOutput(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.outputFlushTimer) {
      clearTimeout(session.outputFlushTimer);
      session.outputFlushTimer = null;
    }

    if (session.pendingOutputChunks.length === 0) {
      return;
    }

    const data = session.pendingOutputChunks.join("");
    session.pendingOutputChunks.length = 0;
    session.outputBuffer = appendBoundedBuffer(session.outputBuffer, data);
    sendToRenderer(
      IPC_CHANNELS.events.sessionData,
      buildSessionDataEvent(sessionId, data),
    );
  }

  function queueSessionOutput(sessionId, data) {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.pendingOutputChunks.push(data);
    if (session.outputFlushTimer) {
      return;
    }

    session.outputFlushTimer = setTimeout(
      () => flushSessionOutput(sessionId),
      OUTPUT_FLUSH_INTERVAL_MS,
    );
  }

  function stopSessionById(sessionId) {
    const session = sessions.get(sessionId);

    if (!session || !session.isRunning) {
      return false;
    }

    session.stopRequested = true;
    session.ptyProcess.kill();
    return true;
  }

  function stopAllSessions() {
    for (const session of sessions.values()) {
      if (session.isRunning) {
        session.ptyProcess.kill();
      }
    }
  }

  function startSession(options, cwd) {
    const command = options.command.trim();
    const label = options.label?.trim() || "";
    const args = Array.isArray(options.argsArray)
      ? options.argsArray
      : splitArgs(options.args || "");
    const cols = Number.isFinite(options.cols) ? options.cols : 120;
    const rows = Number.isFinite(options.rows) ? options.rows : 36;
    const id = options.sessionId || createSessionId();
    const createdAt =
      typeof options.createdAt === "number" ? options.createdAt : Date.now();

    const ptyOptions = {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: buildPtyEnv(),
    };

    const ptyProcess = spawnSessionPty(pty, command, args, ptyOptions);
    diagnosticsService?.log("info", "session-started", {
      sessionId: id,
      command,
      cwd,
    });
    const cleanup = [];

    cleanup.push(
      ptyProcess.onData((data) => {
        queueSessionOutput(id, data);
      }),
    );

    cleanup.push(
      ptyProcess.onExit((event) => {
        const session = sessions.get(id);
        if (!session) {
          return;
        }

        flushSessionOutput(id);
        session.isRunning = false;
        session.endedAt = Date.now();
        session.exitCode = event.exitCode;
        session.signal = event.signal || null;
        diagnosticsService?.log("info", "session-exited", {
          sessionId: id,
          exitCode: event.exitCode,
          signal: event.signal || null,
          stoppedByUser: session.stopRequested,
        });

        sendToRenderer(
          IPC_CHANNELS.events.sessionExit,
          buildSessionExitEvent(
            id,
            event.exitCode,
            event.signal,
            session.stopRequested,
          ),
        );

        session.dispose();
        manualTerminalService.stopManualTerminalBySessionId(id);
        persistenceService.saveSessionsToDisk();
        publishSessionsChanged();
      }),
    );

    const session = {
      id,
      ptyProcess,
      label,
      cwd,
      command,
      args,
      outputBuffer: "",
      createdAt,
      isRunning: true,
      endedAt: null,
      exitCode: null,
      signal: null,
      stopRequested: false,
      pendingOutputChunks: [],
      outputFlushTimer: null,
      dispose() {
        if (this.outputFlushTimer) {
          clearTimeout(this.outputFlushTimer);
          this.outputFlushTimer = null;
        }
        while (cleanup.length) {
          const handler = cleanup.pop();
          if (typeof handler === "function") {
            handler();
          }
        }
      },
    };

    sessions.set(id, session);
    persistenceService.saveSessionsToDisk();
    publishSessionsChanged();

    return buildSessionSummary(session);
  }

  function restartSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.isRunning) {
      throw new Error(
        "Cannot restart a running session or nonexistent session.",
      );
    }

    return startSession(
      {
        label: session.label,
        command: session.command,
        argsArray: session.args,
        cwd: session.cwd,
        sessionId: session.id,
        createdAt: session.createdAt,
      },
      session.cwd,
    );
  }

  function removeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    if (session.isRunning) {
      stopSessionById(sessionId);
    }

    persistenceService.deleteSessionFromDisk(sessionId);
    publishSessionsChanged();
    return { removed: true };
  }

  function writeToSession(sessionId, input) {
    if (!sessionId) {
      throw new Error("A session ID is required.");
    }

    const session = sessions.get(sessionId);
    if (!session || !session.isRunning) {
      throw new Error("No active session.");
    }

    session.ptyProcess.write(input);
    return { ok: true };
  }

  function resizeSession(sessionId, cols, rows) {
    if (!sessionId) {
      return { ok: false };
    }

    const session = sessions.get(sessionId);
    if (!session || !session.isRunning) {
      return { ok: false };
    }

    try {
      session.ptyProcess.resize(cols, rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/pty that has already exited/i.test(message)) {
        return { ok: false };
      }
      throw error;
    }
    return { ok: true };
  }

  function renameSession(sessionId, label) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    const normalizedLabel = String(label || "").trim();
    if (normalizedLabel.length > 120) {
      throw new Error("Session names must be 120 characters or fewer.");
    }

    session.label = normalizedLabel;
    persistenceService.saveSessionsToDisk();
    publishSessionsChanged();
    diagnosticsService?.log("info", "session-renamed", {
      sessionId,
      hasCustomLabel: Boolean(normalizedLabel),
    });
    return buildSessionSummary(session);
  }

  function clearStoppedSessions() {
    let removed = 0;
    for (const [sessionId, session] of sessions.entries()) {
      if (!session.isRunning) {
        sessions.delete(sessionId);
        removed += 1;
      }
    }

    persistenceService.saveSessionsToDisk();
    publishSessionsChanged();
    diagnosticsService?.log("info", "session-history-cleared", { removed });
    return { removed };
  }

  return {
    clearStoppedSessions,
    listSessions,
    publishSessionsChanged,
    renameSession,
    removeSession,
    resizeSession,
    restartSession,
    startSession,
    stopAllSessions,
    stopSessionById,
    writeToSession,
  };
}

module.exports = {
  createSessionService,
};
