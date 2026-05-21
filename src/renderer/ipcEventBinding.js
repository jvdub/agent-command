// ipcEventBinding.js
// Wires agenticApp IPC events to dispatcher commands for extensible, self-documenting event flow.

/**
 * Sets up IPC event bindings: wires agenticApp events to dispatcher commands.
 * @param {CommandDispatcher} dispatcher
 * @param {Object} ipcFunctions - agenticApp or compatible IPC event emitter
 */
export function setupIpcEventBinding(dispatcher, ipcFunctions) {
  // Session PTY output
  ipcFunctions.onSessionData(({ sessionId, data }) => {
    dispatcher.emit("session:dataReceived", { sessionId, data });
  });

  // Session PTY exit
  ipcFunctions.onSessionExit(({ sessionId, exitCode, signal }) => {
    dispatcher.emit("session:exited", { sessionId, exitCode, signal });
  });

  // Manual terminal output
  ipcFunctions.onManualTerminalData(({ sessionId, terminalId, data }) => {
    dispatcher.emit("manualTerminal:dataReceived", {
      sessionId,
      terminalId,
      data,
    });
  });

  // Manual terminal exit
  ipcFunctions.onManualTerminalExit(
    ({ sessionId, terminalId, exitCode, signal }) => {
      dispatcher.emit("manualTerminal:exited", {
        sessionId,
        terminalId,
        exitCode,
        signal,
      });
    },
  );

  // Sessions changed (session list update)
  ipcFunctions.onSessionsChanged((payload) => {
    dispatcher.emit("sessions:changed", payload);
  });
}
