const os = require("os");
const {
  IPC_CHANNELS,
  buildSessionLaunchResponse,
  buildSessionsListResponse,
  buildStopSessionResponse,
} = require("../../shared/ipcContract");

function registerSessionIpcHandlers({
  ipcMain,
  shellForPlatform,
  processInspectionService,
  sessionService,
  workspaceFileService,
}) {
  ipcMain.handle(IPC_CHANNELS.invoke.startSession, async (_event, options) => {
    if (!options?.command || !options.command.trim()) {
      throw new Error("A command is required to start a session.");
    }

    const cwd = await workspaceFileService.ensureWorkingDirectory(options.cwd);
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
  });

  ipcMain.handle(IPC_CHANNELS.invoke.listSessions, async () =>
    buildSessionsListResponse(sessionService.listSessions()),
  );

  ipcMain.handle(IPC_CHANNELS.invoke.stopSession, async (_event, sessionId) => {
    if (!sessionId) {
      throw new Error("A session ID is required.");
    }

    const stopped = sessionService.stopSessionById(sessionId);
    return buildStopSessionResponse(stopped);
  });

  ipcMain.handle(
    IPC_CHANNELS.invoke.restartSession,
    async (_event, sessionId) =>
      buildSessionLaunchResponse(
        sessionService.restartSession(sessionId),
        shellForPlatform(),
        os.homedir(),
      ),
  );

  ipcMain.handle(IPC_CHANNELS.invoke.removeSession, async (_event, sessionId) =>
    sessionService.removeSession(sessionId),
  );

  ipcMain.handle(IPC_CHANNELS.invoke.writeToSession, async (_event, payload) =>
    sessionService.writeToSession(payload?.sessionId, payload?.input),
  );

  ipcMain.handle(IPC_CHANNELS.invoke.resizeSession, async (_event, payload) =>
    sessionService.resizeSession(
      payload?.sessionId,
      payload?.cols,
      payload?.rows,
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.invoke.getSessionProcesses,
    async (_event, sessionId) => {
      if (!sessionId) {
        return {
          processes: [],
          supported: processInspectionService.isProcessInspectionSupported(),
        };
      }

      return processInspectionService.getSessionChildProcesses(sessionId);
    },
  );
}

module.exports = {
  registerSessionIpcHandlers,
};
