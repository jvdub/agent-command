const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const pty = require("node-pty");

const { registerIpcHandlers } = require("./main/ipc/registerIpcHandlers");
const { createServiceRegistry } = require("./main/serviceRegistry");
const { registerAllServices } = require("./main/services");

const serviceRegistry = createServiceRegistry({
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  pty,
  path,
});

registerAllServices(serviceRegistry);

const {
  ptyRuntime,
  processInspectionService,
  sessionService,
  sessionPersistenceService,
  workspaceFileService,
  manualTerminalService,
} = serviceRegistry.resolveAll([
  "ptyRuntime",
  "processInspectionService",
  "sessionService",
  "sessionPersistenceService",
  "workspaceFileService",
  "manualTerminalService",
]);

const ipcRegistry = registerIpcHandlers({
  ipcMain,
  dialog,
  shell,
  resolveInitialDirectory: ptyRuntime.resolveInitialDirectory,
  shellForPlatform: ptyRuntime.shellForPlatform,
  processInspectionService,
  sessionService,
  workspaceFileService,
  manualTerminalService,
});

serviceRegistry.setupIpcHandlers(ipcRegistry);

app.whenReady().then(() => {
  sessionPersistenceService.loadSessionsFromDisk();
  ptyRuntime.windowManager.createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ptyRuntime.windowManager.createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  sessionService.stopAllSessions();
  manualTerminalService.stopAllManualTerminals();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
