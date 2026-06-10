const { IPC_CHANNELS } = require("../../shared/ipcContract");

function registerHandlers(registry, services) {
  const { workspaceFileService } = services;

  registry.register("workspace", IPC_CHANNELS.invoke.openWorkspaceFile, {
    handler: async (_event, payload) => {
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
  });

  registry.register("workspace", IPC_CHANNELS.invoke.listWorkspaceFiles, {
    handler: async (_event, payload) =>
      await workspaceFileService.listWorkspaceFilesForRoot(
        payload?.sessionId,
        payload?.root,
      ),
  });

  registry.register("workspace", IPC_CHANNELS.invoke.listWorkspaceChanges, {
    handler: async (_event, payload) =>
      await workspaceFileService.listWorkspaceChanges(payload?.sessionId),
  });

  registry.register("workspace", IPC_CHANNELS.invoke.saveWorkspaceFile, {
    handler: async (_event, payload) => {
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
  });
}

const registerWorkspaceIpcHandlers = registerHandlers;

module.exports = {
  registerHandlers,
  registerWorkspaceIpcHandlers,
};
