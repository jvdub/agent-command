const os = require("os");
const {
  IPC_CHANNELS,
  buildSessionLaunchResponse,
  buildSessionsListResponse,
  buildStopSessionResponse,
} = require("../../shared/ipcContract");

function registerHandlers(registry, services) {
  const {
    shellForPlatform,
    processInspectionService,
    sessionService,
    workspaceFileService,
  } = services;

  registry.register("sessions", IPC_CHANNELS.invoke.startSession, {
    handler: async (_event, options) => {
      if (!options?.command || !options.command.trim()) {
        throw new Error("A command is required to start a session.");
      }

      const cwd = await workspaceFileService.ensureWorkingDirectory(
        options.cwd,
      );
      try {
        const session = sessionService.startSession(options, cwd);
        return buildSessionLaunchResponse(
          session,
          shellForPlatform(),
          os.homedir(),
        );
      } catch (error) {
        const message = String(error?.message || "Unable to start session.");
        if (process.platform === "win32" && /not found|enoent/i.test(message)) {
          throw new Error(
            `Command not found: ${options.command.trim()}. On Windows, confirm the CLI is installed and available in PATH for this app process.`,
          );
        }

        throw error;
      }
    },
  });

  registry.register("sessions", IPC_CHANNELS.invoke.listSessions, {
    handler: async () =>
      buildSessionsListResponse(sessionService.listSessions()),
  });

  registry.register("sessions", IPC_CHANNELS.invoke.stopSession, {
    handler: async (_event, sessionId) => {
      if (!sessionId) {
        throw new Error("A session ID is required.");
      }

      const stopped = sessionService.stopSessionById(sessionId);
      return buildStopSessionResponse(stopped);
    },
  });

  registry.register("sessions", IPC_CHANNELS.invoke.restartSession, {
    handler: async (_event, sessionId) =>
      buildSessionLaunchResponse(
        sessionService.restartSession(sessionId),
        shellForPlatform(),
        os.homedir(),
      ),
  });

  registry.register("sessions", IPC_CHANNELS.invoke.removeSession, {
    handler: async (_event, sessionId) =>
      sessionService.removeSession(sessionId),
  });

  registry.register("sessions", IPC_CHANNELS.invoke.writeToSession, {
    handler: async (_event, payload) =>
      sessionService.writeToSession(payload?.sessionId, payload?.input),
  });

  registry.register("sessions", IPC_CHANNELS.invoke.resizeSession, {
    handler: async (_event, payload) =>
      sessionService.resizeSession(
        payload?.sessionId,
        payload?.cols,
        payload?.rows,
      ),
  });

  registry.register("sessions", IPC_CHANNELS.invoke.getSessionProcesses, {
    handler: async (_event, sessionId) => {
      if (!sessionId) {
        return {
          processes: [],
          supported: processInspectionService.isProcessInspectionSupported(),
        };
      }

      return processInspectionService.getSessionChildProcesses(sessionId);
    },
  });
}

const registerSessionIpcHandlers = registerHandlers;

module.exports = {
  registerHandlers,
  registerSessionIpcHandlers,
};
