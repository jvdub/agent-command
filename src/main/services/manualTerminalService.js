const {
  IPC_CHANNELS,
  buildManualTerminalDataEvent,
  buildManualTerminalExitEvent,
} = require("../../shared/ipcContract");
const { appendBoundedBuffer } = require("./boundedBuffer");

function createManualTerminalService({
  pty,
  sessions,
  sendToRenderer,
  interactiveShellForPlatform,
  shellArgsForPlatform,
  buildPtyEnv,
}) {
  const manualTerminals = new Map();

  function getManualTerminalKey(sessionId, terminalId = "1") {
    return `${sessionId}:${terminalId}`;
  }

  function startManualTerminal(session, terminalId = "1") {
    const cols = 120;
    const rows = 36;
    const shell = interactiveShellForPlatform();
    const shellArgs = shellArgsForPlatform();
    const key = getManualTerminalKey(session.id, terminalId);
    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: session.cwd,
      env: buildPtyEnv(),
    });

    const cleanup = [];

    const terminalState = {
      key,
      sessionId: session.id,
      terminalId,
      cwd: session.cwd,
      shell,
      ptyProcess,
      isRunning: true,
      outputBuffer: "",
      dispose() {
        while (cleanup.length) {
          const handler = cleanup.pop();
          if (typeof handler === "function") {
            handler();
          }
        }
      },
    };

    cleanup.push(
      ptyProcess.onData((data) => {
        const existing = manualTerminals.get(key);
        if (!existing) {
          return;
        }

        existing.outputBuffer = appendBoundedBuffer(
          existing.outputBuffer,
          data,
        );
        sendToRenderer(
          IPC_CHANNELS.events.manualTerminalData,
          buildManualTerminalDataEvent(session.id, terminalId, data),
        );
      }),
    );

    cleanup.push(
      ptyProcess.onExit((event) => {
        const existing = manualTerminals.get(key);
        if (!existing) {
          return;
        }

        existing.isRunning = false;
        sendToRenderer(
          IPC_CHANNELS.events.manualTerminalExit,
          buildManualTerminalExitEvent(
            session.id,
            terminalId,
            event.exitCode,
            event.signal,
          ),
        );
        existing.dispose();
      }),
    );

    manualTerminals.set(key, terminalState);
    return terminalState;
  }

  function ensureManualTerminal(sessionId, terminalId = "1") {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error("No session found for manual terminal.");
    }

    const key = getManualTerminalKey(sessionId, terminalId);
    const existing = manualTerminals.get(key);
    if (existing) {
      return existing;
    }

    return startManualTerminal(session, terminalId);
  }

  function stopManualTerminalBySessionId(sessionId) {
    for (const [key, terminal] of manualTerminals.entries()) {
      if (terminal.sessionId !== sessionId) {
        continue;
      }

      if (terminal.isRunning) {
        terminal.ptyProcess.kill();
      }

      terminal.dispose();
      manualTerminals.delete(key);
    }
  }

  function stopAllManualTerminals() {
    for (const [key, terminal] of manualTerminals.entries()) {
      if (terminal.isRunning) {
        terminal.ptyProcess.kill();
      }

      terminal.dispose();
      manualTerminals.delete(key);
    }
  }

  return {
    ensureManualTerminal,
    stopAllManualTerminals,
    stopManualTerminalBySessionId,
  };
}

module.exports = {
  createManualTerminalService,
};
