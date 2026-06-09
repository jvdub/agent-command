import { agenticApp } from "./agenticApp.js";

export function bindSessionEvents({
  updateInsightFromOutput,
  appendSessionBuffer,
  ingestFileReferences,
  sessionTerminals,
  renderSessionFileReferences,
  getActiveSessionId,
  scheduleUiRefresh,
  ensureSessionInsight,
  manualTerminalKey,
  manualTerminalBuffers,
  manualTerminals,
  updateSessions,
}) {
  agenticApp.onSessionData(({ sessionId, data }) => {
    updateInsightFromOutput(sessionId, data);
    appendSessionBuffer(sessionId, data);
    ingestFileReferences(sessionId, data);

    const instance = sessionTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(data);
    }

    if (getActiveSessionId() === sessionId) {
      renderSessionFileReferences(sessionId);
    }

    scheduleUiRefresh();
  });

  agenticApp.onSessionExit(({ sessionId, exitCode, signal }) => {
    const insight = ensureSessionInsight(sessionId);
    insight.awaitingPermission = false;
    insight.awaitingQuestion = false;
    if (exitCode !== 0) {
      insight.hasError = true;
      insight.errorMessage = `Exited with code ${exitCode}`;
      insight.lastErrorAt = Date.now();
    }

    const exitLine = `\r\n[session exited: ${exitCode}${signal ? `, signal ${signal}` : ""}]\r\n`;
    appendSessionBuffer(sessionId, exitLine);

    const instance = sessionTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(exitLine);
    }

    scheduleUiRefresh();
  });

  agenticApp.onManualTerminalData(({ sessionId, terminalId, data }) => {
    const key = manualTerminalKey(sessionId, String(terminalId || "1"));
    manualTerminalBuffers.set(
      key,
      `${manualTerminalBuffers.get(key) || ""}${data}`,
    );

    const instance = manualTerminals.get(key);
    if (instance) {
      instance.terminal.write(data);
    }
  });

  agenticApp.onManualTerminalExit(
    ({ sessionId, terminalId, exitCode, signal }) => {
      const key = manualTerminalKey(sessionId, String(terminalId || "1"));
      const exitLine = `\r\n[terminal exited: ${exitCode}${signal ? `, signal ${signal}` : ""}]\r\n`;
      manualTerminalBuffers.set(
        key,
        `${manualTerminalBuffers.get(key) || ""}${exitLine}`,
      );

      const instance = manualTerminals.get(key);
      if (instance) {
        instance.terminal.write(exitLine);
      }
    },
  );

  agenticApp.onSessionsChanged((payload) => {
    updateSessions(payload);
  });
}

export function createSessionLifecycleHandlers({
  setProcessInspectionSupport,
  cwdInput,
  setStatus,
  updateSessions,
  labelInput,
  commandInput,
  argsInput,
  ensureSessionBuffer,
  ensureSessionInsight,
  createSessionTerminal,
  getSessionDisplayName,
  closeSessionPopover,
  openTerminalView,
  getActiveSessionId,
  markSessionInput,
  scheduleUiRefresh,
  showEmptyView,
  setSessionRestartPending,
}) {
  return {
    async initializeContext() {
      const context = await agenticApp.getContext();
      setProcessInspectionSupport(context.processInspectionSupported);
      cwdInput.value = context.cwd;
      setStatus("Idle", `Default directory ${context.cwd}`);

      const existing = await agenticApp.listSessions();
      updateSessions(existing.sessions || []);

      const runningCount = (existing.sessions || []).filter(
        (session) => session.isRunning,
      ).length;
      if (runningCount > 0) {
        setStatus(
          "Restored",
          `${runningCount} running session${runningCount === 1 ? "" : "s"} recovered`,
        );
      }
    },

    async startSession(event) {
      event.preventDefault();

      const command = commandInput.value.trim();
      const label = labelInput?.value?.trim() || "";
      const args = argsInput.value;
      const cwd = cwdInput.value.trim();

      if (!command) {
        setStatus("Error", "Command is required");
        return;
      }

      try {
        const cols = 120;
        const rows = 36;
        const result = await agenticApp.startSession({
          label,
          command,
          args,
          cwd,
          cols,
          rows,
        });
        const session = result.session;

        ensureSessionBuffer(session.id);
        ensureSessionInsight(session.id);
        createSessionTerminal(session.id);

        setStatus(
          "Running",
          `${getSessionDisplayName(session)} (${session.cwd})`,
        );
        closeSessionPopover();
        await openTerminalView(session.id);
      } catch (error) {
        setStatus("Error", error.message || "Unable to start session");
      }
    },

    async stopSession() {
      const activeSessionId = getActiveSessionId();
      if (!activeSessionId) {
        return;
      }

      try {
        await agenticApp.stopSession(activeSessionId);
        setStatus("Stopped", "Session terminated by user");
      } catch (error) {
        setStatus("Error", error.message || "Unable to stop session");
      }
    },

    async sendInterrupt() {
      const activeSessionId = getActiveSessionId();
      if (!activeSessionId) {
        return;
      }

      await agenticApp.writeToSession(activeSessionId, "\u0003");
      markSessionInput(activeSessionId);
      scheduleUiRefresh();
    },

    async sendManualInterrupt(terminalId) {
      const activeSessionId = getActiveSessionId();
      if (!activeSessionId) {
        return;
      }

      await agenticApp.writeToManualTerminal(
        activeSessionId,
        "\u0003",
        terminalId,
      );
    },

    async pickDirectory() {
      const selected = await agenticApp.pickDirectory();
      if (selected) {
        cwdInput.value = selected;
      }
    },

    async restartSessionFromSidebar(sessionId) {
      if (!setSessionRestartPending(sessionId, true)) {
        return;
      }

      setStatus("Restarting", "Restarting session...");

      try {
        const result = await agenticApp.restartSession(sessionId);
        const session = result.session;

        ensureSessionBuffer(session.id);
        ensureSessionInsight(session.id);
        createSessionTerminal(session.id);

        setStatus(
          "Running",
          `${getSessionDisplayName(session)} (${session.cwd})`,
        );
        await openTerminalView(session.id);
      } catch (error) {
        setStatus("Error", error.message || "Unable to restart session");
      } finally {
        setSessionRestartPending(sessionId, false);
      }
    },

    async removeSessionFromSidebar(sessionId) {
      try {
        await agenticApp.removeSession(sessionId);
        setStatus("Removed", "Session deleted");

        if (getActiveSessionId() === sessionId) {
          showEmptyView(false);
        }
      } catch (error) {
        setStatus("Error", error.message || "Unable to remove session");
      }
    },
  };
}
