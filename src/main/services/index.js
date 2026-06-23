const {
  buildPtyEnv,
  interactiveShellForPlatform,
  resolveInitialDirectory,
  shellArgsForPlatform,
  shellForPlatform,
  splitArgs,
} = require("../platform");
const { spawnSessionPty } = require("../ptyRuntime");
const { createWindowManager } = require("../window");
const {
  createManualTerminalService,
} = require("./manualTerminalService");
const {
  createProcessInspectionService,
} = require("./processInspectionService");
const {
  createSessionPersistenceService,
} = require("./sessionPersistenceService");
const { createSessionService } = require("./sessionService");
const { createWorkspaceFileService } = require("./workspaceFileService");

/**
 * Registers all main-process services and their dependencies.
 *
 * @param {{ register: Function }} registry
 */
function registerAllServices(registry) {
  const sessions = new Map();
  let windowManager = null;

  function ensureWindowManager({ BrowserWindow, path }) {
    if (windowManager) {
      return windowManager;
    }

    windowManager = createWindowManager({
      BrowserWindow,
      preloadPath: path.join(__dirname, "..", "..", "preload.js"),
      indexHtmlPath: path.join(__dirname, "..", "..", "renderer", "index.html"),
    });

    return windowManager;
  }

  registry.register(
    "ptyRuntime",
    "PTY Runtime",
    ({ BrowserWindow, path }) => {
      const manager = ensureWindowManager({ BrowserWindow, path });

      return {
        buildPtyEnv,
        interactiveShellForPlatform,
        resolveInitialDirectory,
        sessions,
        shellArgsForPlatform,
        shellForPlatform,
        spawnSessionPty,
        splitArgs,
        windowManager: manager,
      };
    },
    [],
  );

  registry.register(
    "sessionPersistenceService",
    "Session Persistence Service",
    ({ app, safeStorage }) =>
      createSessionPersistenceService({
        app,
        safeStorage,
        sessions,
      }),
    [],
  );

  registry.register(
    "manualTerminalService",
    "Manual Terminal Service",
    ({ pty, ptyRuntime }) =>
      createManualTerminalService({
        pty,
        sessions,
        sendToRenderer: ptyRuntime.windowManager.sendToRenderer,
        interactiveShellForPlatform: ptyRuntime.interactiveShellForPlatform,
        shellArgsForPlatform: ptyRuntime.shellArgsForPlatform,
        buildPtyEnv: ptyRuntime.buildPtyEnv,
      }),
    ["ptyRuntime"],
  );

  registry.register(
    "processInspectionService",
    "Process Inspection Service",
    () =>
      createProcessInspectionService({
        sessions,
      }),
    [],
  );

  registry.register(
    "workspaceFileService",
    "Workspace File Service",
    ({ BrowserWindow, dialog, path }) =>
      createWorkspaceFileService({
        sessions,
        dialog,
        getMainWindow: () => ensureWindowManager({ BrowserWindow, path }).getMainWindow(),
        resolveInitialDirectory,
        sendToRenderer: ensureWindowManager({ BrowserWindow, path }).sendToRenderer,
      }),
    [],
  );

  registry.register(
    "sessionService",
    "Session Service",
    ({
      pty,
      ptyRuntime,
      sessionPersistenceService,
      manualTerminalService,
    }) =>
      createSessionService({
        sessions,
        pty,
        sendToRenderer: ptyRuntime.windowManager.sendToRenderer,
        buildPtyEnv: ptyRuntime.buildPtyEnv,
        splitArgs: ptyRuntime.splitArgs,
        spawnSessionPty: ptyRuntime.spawnSessionPty,
        persistenceService: sessionPersistenceService,
        manualTerminalService,
      }),
    ["ptyRuntime", "sessionPersistenceService", "manualTerminalService"],
  );
}

module.exports = {
  registerAllServices,
};
