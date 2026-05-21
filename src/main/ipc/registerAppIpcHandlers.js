const os = require("os");
const { IPC_CHANNELS, buildOkResponse } = require("../../shared/ipcContract");

function registerHandlers(registry, services) {
  const {
    dialog,
    shell,
    resolveInitialDirectory,
    shellForPlatform,
    processInspectionService,
  } = services;

  registry.register("app", IPC_CHANNELS.invoke.pickDirectory, {
    handler: async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        defaultPath: resolveInitialDirectory(),
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    },
  });

  registry.register("app", IPC_CHANNELS.invoke.getContext, {
    handler: async () => ({
      cwd: resolveInitialDirectory(),
      homeDirectory: os.homedir(),
      shell: shellForPlatform(),
      platform: process.platform,
      processInspectionSupported:
        processInspectionService.isProcessInspectionSupported(),
    }),
  });

  registry.register("app", IPC_CHANNELS.invoke.openExternalUrl, {
    handler: async (_event, payload) => {
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
  });
}

const registerAppIpcHandlers = registerHandlers;

module.exports = {
  registerAppIpcHandlers,
  registerHandlers,
};
