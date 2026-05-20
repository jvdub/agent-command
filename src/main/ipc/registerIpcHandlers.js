const { registerAppIpcHandlers } = require("./registerAppIpcHandlers");
const { registerSessionIpcHandlers } = require("./registerSessionIpcHandlers");
const { registerWorkspaceIpcHandlers } = require("./registerWorkspaceIpcHandlers");
const {
  registerManualTerminalIpcHandlers,
} = require("./registerManualTerminalIpcHandlers");

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
  registerAppIpcHandlers({
    ipcMain,
    dialog,
    shell,
    resolveInitialDirectory,
    shellForPlatform,
    processInspectionService,
  });

  registerSessionIpcHandlers({
    ipcMain,
    shellForPlatform,
    processInspectionService,
    sessionService,
    workspaceFileService,
  });

  registerWorkspaceIpcHandlers({
    ipcMain,
    workspaceFileService,
  });

  registerManualTerminalIpcHandlers({
    ipcMain,
    manualTerminalService,
  });
}

module.exports = {
  registerIpcHandlers,
};
