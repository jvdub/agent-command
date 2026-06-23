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
  shellForPlatform,
} = require("./main/platform");
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
  sessionPersistenceService,
  sessionService,
  workspaceFileService,
  manualTerminalService,
} = serviceRegistry.resolveAll([
  "ptyRuntime",
  "processInspectionService",
  "sessionPersistenceService",
  "sessionService",
  "workspaceFileService",
  "manualTerminalService",
]);

const ipcRegistry = registerIpcHandlers({
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
});
serviceRegistry.setupIpcHandlers(ipcRegistry);

const windowManager = ptyRuntime.windowManager;
let isShuttingDown = false;

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
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) {
    return;
  }

  // Keep renderer-first shortcuts available by removing native menu accelerators.
  Menu.setApplicationMenu(null);

  sessionPersistenceService.loadSessionsFromDisk();
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
