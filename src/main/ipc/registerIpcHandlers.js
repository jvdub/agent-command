const { createIpcHandlerRegistry } = require("./handlerRegistry");
const {
  registerHandlers: registerAppHandlers,
} = require("./registerAppIpcHandlers");
const {
  registerHandlers: registerSessionHandlers,
} = require("./registerSessionIpcHandlers");
const {
  registerHandlers: registerWorkspaceHandlers,
} = require("./registerWorkspaceIpcHandlers");
const {
  registerHandlers: registerManualTerminalHandlers,
} = require("./registerManualTerminalIpcHandlers");

function registerIpcHandlers({
  ipcMain,
  dialog,
  clipboard,
  shell,
  resolveInitialDirectory,
  shellForPlatform,
  processInspectionService,
  sessionService,
  workspaceFileService,
  manualTerminalService,
  diagnosticsService,
  app,
  isCommandAvailable,
  isSupportedPlatform,
}) {
  const registry = createIpcHandlerRegistry(ipcMain, {
    ipcMain,
    dialog,
    clipboard,
    shell,
    resolveInitialDirectory,
    shellForPlatform,
    processInspectionService,
    sessionService,
    workspaceFileService,
    manualTerminalService,
    diagnosticsService,
    app,
    isCommandAvailable,
    isSupportedPlatform,
  });

  registry.registerFromModules([
    registerAppHandlers,
    registerSessionHandlers,
    registerWorkspaceHandlers,
    registerManualTerminalHandlers,
  ]);

  return registry;
}

module.exports = {
  registerIpcHandlers,
};
