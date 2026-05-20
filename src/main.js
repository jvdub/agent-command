const path = require("path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const pty = require("node-pty");

const {
  buildPtyEnv,
  interactiveShellForPlatform,
  resolveInitialDirectory,
  shellArgsForPlatform,
  shellForPlatform,
  splitArgs,
} = require("./main/platform");
const { registerIpcHandlers } = require("./main/ipc/registerIpcHandlers");
const { spawnSessionPty } = require("./main/ptyRuntime");
const {
  createManualTerminalService,
} = require("./main/services/manualTerminalService");
const {
  createProcessInspectionService,
} = require("./main/services/processInspectionService");
const {
  createSessionPersistenceService,
} = require("./main/services/sessionPersistenceService");
const { createSessionService } = require("./main/services/sessionService");
const {
  createWorkspaceFileService,
} = require("./main/services/workspaceFileService");
const { createWindowManager } = require("./main/window");

const sessions = new Map();

const windowManager = createWindowManager({
  BrowserWindow,
  preloadPath: path.join(__dirname, "preload.js"),
  indexHtmlPath: path.join(__dirname, "renderer", "index.html"),
});

const sessionPersistenceService = createSessionPersistenceService({
  app,
  sessions,
});

const manualTerminalService = createManualTerminalService({
  pty,
  sessions,
  sendToRenderer: windowManager.sendToRenderer,
  interactiveShellForPlatform,
  shellArgsForPlatform,
  buildPtyEnv,
});

const processInspectionService = createProcessInspectionService({
  sessions,
});

const workspaceFileService = createWorkspaceFileService({
  sessions,
  dialog,
  getMainWindow: windowManager.getMainWindow,
  resolveInitialDirectory,
});

const sessionService = createSessionService({
  sessions,
  pty,
  sendToRenderer: windowManager.sendToRenderer,
  buildPtyEnv,
  splitArgs,
  spawnSessionPty,
  persistenceService: sessionPersistenceService,
  manualTerminalService,
});

registerIpcHandlers({
  ipcMain,
  dialog,
  shell,
  resolveInitialDirectory,
  shellForPlatform,
  processInspectionService,
  sessionService,
  workspaceFileService,
  manualTerminalService,
});

app.whenReady().then(() => {
  sessionPersistenceService.loadSessionsFromDisk();
  windowManager.createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createWindow();
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
