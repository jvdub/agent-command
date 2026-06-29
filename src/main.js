const path = require("path");
const pty = require("node-pty");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  shell,
} = require("electron");

const { IPC_CHANNELS } = require("./shared/ipcContract");
const {
  resolveInitialDirectory,
  isCommandAvailable,
  isSupportedPlatform,
  shellForPlatform,
} = require("./main/platform");
const { configureStableUserDataPath } = require("./main/appPaths");
const { createServiceRegistry } = require("./main/serviceRegistry");
const { registerAllServices } = require("./main/services");
const { registerIpcHandlers } = require("./main/ipc/registerIpcHandlers");

function presentWindow(win) {
  if (!win || win.isDestroyed()) {
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
  win.focus();
  if (typeof win.moveTop === "function") {
    win.moveTop();
  }
}

function attachQuickOpenShortcutForwarding(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = String(input?.key || "").toLowerCase();
    if (!(input?.control || input?.meta) || input?.alt || key !== "p") {
      return;
    }

    event.preventDefault();
    mainWindow.webContents.send(IPC_CHANNELS.events.shortcutQuickOpen);
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

configureStableUserDataPath(app, path, process.argv);

const serviceRegistry = createServiceRegistry({
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  path,
  pty,
  safeStorage,
  shell,
});

registerAllServices(serviceRegistry);

const {
  ptyRuntime,
  processInspectionService,
  diagnosticsService,
  sessionPersistenceService,
  sessionService,
  workspaceFileService,
  manualTerminalService,
  managedRunPersistenceService,
  managedRunService,
} = serviceRegistry.resolveAll([
  "ptyRuntime",
  "processInspectionService",
  "diagnosticsService",
  "sessionPersistenceService",
  "sessionService",
  "workspaceFileService",
  "manualTerminalService",
  "managedRunPersistenceService",
  "managedRunService",
]);

const ipcRegistry = registerIpcHandlers({
  ipcMain,
  dialog,
  clipboard,
  shell,
  resolveInitialDirectory,
  shellForPlatform,
  processInspectionService,
  diagnosticsService,
  app,
  isCommandAvailable,
  isSupportedPlatform,
  sessionService,
  workspaceFileService,
  manualTerminalService,
  managedRunService,
});
serviceRegistry.setupIpcHandlers(ipcRegistry);

const windowManager = ptyRuntime.windowManager;
let isShuttingDown = false;

process.on("uncaughtExceptionMonitor", (error, origin) => {
  diagnosticsService.log("error", "uncaught-exception", {
    message: error.message,
    name: error.name,
    origin,
    stack: error.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  diagnosticsService.log("error", "unhandled-rejection", {
    reason:
      reason instanceof Error
        ? { message: reason.message, name: reason.name, stack: reason.stack }
        : String(reason),
  });
});

function createMainWindow() {
  const win = windowManager.createWindow();

  win.once("ready-to-show", () => {
    presentWindow(win);
  });

  attachQuickOpenShortcutForwarding(win);

  return win;
}

function focusOrCreateMainWindow() {
  const existingWindow = windowManager.getMainWindow();
  if (existingWindow && !existingWindow.isDestroyed()) {
    presentWindow(existingWindow);
    return existingWindow;
  }

  return createMainWindow();
}

function shutdownSessionsAndPersist() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  sessionService.stopAllSessions();
  sessionPersistenceService.saveSessionsToDisk();
  managedRunPersistenceService.save();
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) {
    return;
  }

  // Keep renderer-first shortcuts available by removing native menu accelerators.
  Menu.setApplicationMenu(null);

  sessionPersistenceService.loadSessionsFromDisk();
  managedRunPersistenceService.load();
  diagnosticsService.log("info", "app-ready", {
    version: app.getVersion(),
    platform: process.platform,
  });
  createMainWindow();

  app.on("second-instance", () => {
    focusOrCreateMainWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      return;
    }

    focusOrCreateMainWindow();
  });
});

app.on("before-quit", () => {
  shutdownSessionsAndPersist();
});

app.on("window-all-closed", () => {
  shutdownSessionsAndPersist();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
