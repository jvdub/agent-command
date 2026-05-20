const { IPC_CHANNELS } = require("../../shared/ipcContract");

function registerWorkspaceIpcHandlers({ ipcMain, workspaceFileService }) {
  ipcMain.handle(
    IPC_CHANNELS.invoke.openWorkspaceFile,
    async (_event, payload) => {
      const sessionId = payload?.sessionId;
      const filePath = payload?.filePath;

      try {
        return await workspaceFileService.openEditorFile(sessionId, filePath);
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
      await workspaceFileService.listWorkspaceFilesForRoot(
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

      return await workspaceFileService.saveEditorFile(
        sessionId,
        filePath,
        content,
      );
    },
  );
}

module.exports = {
  registerWorkspaceIpcHandlers,
};
