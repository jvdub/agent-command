const os = require("os");
const {
  IPC_CHANNELS,
  buildManualTerminalState,
  buildOkResponse,
  buildSessionLaunchResponse,
  buildSessionsListResponse,
  buildStopSessionResponse,
} = require("../../shared/ipcContract");

function registerIpcHandlers({
  ipcMain,
  dialog,
  shell,
  resolveInitialDirectory,
  shellForPlatform,
  processInspectionService,
  sessionService,
  workspaceFileService,
  manualTerminalService,
}) {
  ipcMain.handle(IPC_CHANNELS.invoke.pickDirectory, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: resolveInitialDirectory(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.invoke.getContext, async () => ({
    cwd: resolveInitialDirectory(),
    homeDirectory: os.homedir(),
    shell: shellForPlatform(),
    platform: process.platform,
    processInspectionSupported:
      processInspectionService.isProcessInspectionSupported(),
  }));

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

  ipcMain.handle(
    IPC_CHANNELS.invoke.openWorkspaceFile,
    async (_event, payload) => {
      const sessionId = payload?.sessionId;
      const filePath = payload?.filePath;

      try {
        return workspaceFileService.openEditorFile(sessionId, filePath);
      } catch (error) {
        const detail = String(filePath || "").slice(0, 220);
        throw new Error(
          `${error?.message || "Unable to open file."} (reference: ${detail || "<empty>"})`,
        );
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.invoke.listWorkspaceFiles,
    async (_event, payload) =>
      workspaceFileService.listWorkspaceFilesForRoot(
        payload?.sessionId,
        payload?.root,
      ),
  );

  ipcMain.handle(
    IPC_CHANNELS.invoke.saveWorkspaceFile,
    async (_event, payload) => {
      const sessionId = payload?.sessionId;
      const filePath = payload?.filePath;
      const content = payload?.content;

      if (typeof content !== "string") {
        throw new Error("Editor content must be a string.");
      }

      return workspaceFileService.saveEditorFile(sessionId, filePath, content);
    },
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

  ipcMain.handle(
    IPC_CHANNELS.invoke.ensureManualTerminal,
    async (_event, payload) => {
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
  );

  ipcMain.handle(
    IPC_CHANNELS.invoke.writeToManualTerminal,
    async (_event, payload) => {
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
  );

  ipcMain.handle(
    IPC_CHANNELS.invoke.resizeManualTerminal,
    async (_event, payload) => {
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
  );

  ipcMain.handle(
    IPC_CHANNELS.invoke.openExternalUrl,
    async (_event, payload) => {
      const rawUrl = String(payload?.url || "").trim();
      if (!rawUrl) {
        throw new Error("A URL is required.");
      }

      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        throw new Error("Invalid URL.");
      }

      if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error("Only http and https links are allowed.");
      }

      await shell.openExternal(parsed.toString());
      return buildOkResponse(true);
    },
  );
}

module.exports = {
  registerIpcHandlers,
};
