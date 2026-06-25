const {
  IPC_CHANNELS,
  buildManualTerminalState,
  buildOkResponse,
} = require("../../shared/ipcContract");

function registerHandlers(registry, services) {
  const { manualTerminalService } = services;

  registry.register("manual-terminal", IPC_CHANNELS.invoke.ensureManualTerminal, {
    handler: async (_event, payload) => {
      const sessionId =
        typeof payload === "string" ? payload : payload?.sessionId;
      const terminalId =
        typeof payload === "string" ? "1" : String(payload?.terminalId || "1");

      if (!sessionId) {
        throw new Error("A session ID is required.");
      }

      const terminal = manualTerminalService.ensureManualTerminal(
        sessionId,
        terminalId,
      );
      return buildManualTerminalState(terminal);
    },
  });

  registry.register("manual-terminal", IPC_CHANNELS.invoke.writeToManualTerminal, {
    handler: async (_event, payload) => {
      const sessionId = payload?.sessionId;
      const terminalId = String(payload?.terminalId || "1");
      const input = payload?.input;

      if (!sessionId) {
        throw new Error("A session ID is required.");
      }

      const terminal = manualTerminalService.ensureManualTerminal(
        sessionId,
        terminalId,
      );
      if (!terminal.isRunning) {
        throw new Error("Manual terminal is not running.");
      }

      terminal.ptyProcess.write(input || "");
      return buildOkResponse(true);
    },
  });

  registry.register("manual-terminal", IPC_CHANNELS.invoke.resizeManualTerminal, {
    handler: async (_event, payload) => {
      const sessionId = payload?.sessionId;
      const terminalId = String(payload?.terminalId || "1");
      const cols = payload?.cols;
      const rows = payload?.rows;

      if (!sessionId) {
        return buildOkResponse(false);
      }

      const terminal = manualTerminalService.ensureManualTerminal(
        sessionId,
        terminalId,
      );
      if (!terminal.isRunning) {
        return buildOkResponse(false);
      }

      terminal.ptyProcess.resize(cols, rows);
      return buildOkResponse(true);
    },
  });

  registry.register("manual-terminal", IPC_CHANNELS.invoke.closeManualTerminal, {
    handler: async (_event, payload) => {
      const sessionId = payload?.sessionId;
      const terminalId = String(payload?.terminalId || "1");

      if (!sessionId) {
        return buildOkResponse(false);
      }

      return manualTerminalService.closeManualTerminal(sessionId, terminalId);
    },
  });
}

const registerManualTerminalIpcHandlers = registerHandlers;

module.exports = {
  registerHandlers,
  registerManualTerminalIpcHandlers,
};
