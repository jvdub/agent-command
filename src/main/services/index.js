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
const { createDiagnosticsService } = require("./diagnosticsService");
const {
  createProcessInspectionService,
} = require("./processInspectionService");
const {
  createSessionPersistenceService,
} = require("./sessionPersistenceService");
const { createSessionService } = require("./sessionService");
const { createWorkspaceFileService } = require("./workspaceFileService");
const { createManagedRunPersistenceService } = require("./managedRunPersistenceService");
const { createManagedRunWorkspaceService } = require("./managedRunWorkspaceService");
const { createWorkerProviderRegistry } = require("./workerProviderRegistry");
const { createWorkerProcessService } = require("./workerProcessService");
const { createLocalInferenceService } = require("./localInferenceService");
const { createTaskSchedulerService } = require("./taskSchedulerService");
const { createManagedRunService } = require("./managedRunService");
const { createShapeDomainDocumentService } = require("./shapeDomainDocumentService");
const { createTokenLedgerService } = require("./tokenLedgerService");
const { IPC_CHANNELS } = require("../../shared/ipcContract");

/**
 * Registers all main-process services and their dependencies.
 *
 * @param {{ register: Function }} registry
 */
function registerAllServices(registry) {
  const sessions = new Map();
  const managedRuns = new Map();
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
    "diagnosticsService",
    "Diagnostics Service",
    ({ app }) => createDiagnosticsService({ app }),
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
      diagnosticsService,
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
        diagnosticsService,
      }),
    [
      "ptyRuntime",
      "sessionPersistenceService",
      "manualTerminalService",
      "diagnosticsService",
    ],
  );

  registry.register(
    "managedRunPersistenceService",
    "Managed Run Persistence Service",
    ({ app, safeStorage }) =>
      createManagedRunPersistenceService({
        app,
        safeStorage,
        runs: managedRuns,
      }),
    [],
  );

  registry.register(
    "managedRunWorkspaceService",
    "Managed Run Workspace Service",
    ({ app, path }) => createManagedRunWorkspaceService({
      worktreeRoot: path.join(app.getPath("userData"), "managed-run-worktrees"),
    }),
    [],
  );

  registry.register(
    "workerProviderRegistry",
    "Managed Worker Provider Registry",
    () => createWorkerProviderRegistry(),
    [],
  );

  registry.register(
    "workerProcessService",
    "Managed Worker Process Service",
    ({ ptyRuntime }) =>
      createWorkerProcessService({
        onOutput: (payload) =>
          ptyRuntime.windowManager.sendToRenderer(
            IPC_CHANNELS.events.managedRunWorkerOutput,
            payload,
          ),
      }),
    ["ptyRuntime"],
  );

  registry.register(
    "localInferenceService",
    "Local Inference Service",
    () => createLocalInferenceService(),
    [],
  );

  registry.register(
    "tokenLedgerService",
    "Managed Run Token Ledger",
    () => createTokenLedgerService(),
    [],
  );

  registry.register(
    "taskSchedulerService",
    "Managed Run Task Scheduler",
    ({
      ptyRuntime,
      workerProviderRegistry,
      workerProcessService,
      managedRunPersistenceService,
      tokenLedgerService,
      localInferenceService,
    }) =>
      createTaskSchedulerService({
        workerProviderRegistry,
        workerProcessService,
        managedRunPersistenceService,
        tokenLedgerService,
        localInferenceService,
        publishRun: (run) =>
          ptyRuntime.windowManager.sendToRenderer(
            IPC_CHANNELS.events.managedRunChanged,
            run,
          ),
      }),
    [
      "ptyRuntime",
      "workerProviderRegistry",
      "workerProcessService",
      "managedRunPersistenceService",
      "tokenLedgerService",
      "localInferenceService",
    ],
  );

  registry.register(
    "shapeDomainDocumentService",
    "Shape Domain Document Service",
    () => createShapeDomainDocumentService(),
    [],
  );

  registry.register(
    "managedRunService",
    "Managed Run Service",
    ({
      ptyRuntime,
      managedRunPersistenceService,
      workerProviderRegistry,
      workerProcessService,
      taskSchedulerService,
      tokenLedgerService,
      workspaceFileService,
      managedRunWorkspaceService,
      sessionService,
      shapeDomainDocumentService,
    }) =>
      createManagedRunService({
        runs: managedRuns,
        managedRunPersistenceService,
        workerProviderRegistry,
        workerProcessService,
        getTaskSchedulerService: () => taskSchedulerService,
        tokenLedgerService,
        workspaceFileService,
        managedRunWorkspaceService,
        sessionService,
        shapeDomainDocumentService,
        publishRun: (run) =>
          ptyRuntime.windowManager.sendToRenderer(
            IPC_CHANNELS.events.managedRunChanged,
            run,
          ),
      }),
    [
      "ptyRuntime",
      "managedRunPersistenceService",
      "workerProviderRegistry",
      "workerProcessService",
      "taskSchedulerService",
      "tokenLedgerService",
      "workspaceFileService",
      "managedRunWorkspaceService",
      "sessionService",
      "shapeDomainDocumentService",
    ],
  );
}

module.exports = {
  registerAllServices,
};
