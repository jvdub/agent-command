const { clipboard, contextBridge, ipcRenderer } = require("electron");

// BEGIN AUTO-GENERATED IPC CHANNELS
const IPC_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    getContext: "app:getContext",
    checkCommand: "app:check-command",
    getDiagnostics: "app:get-diagnostics",
    openDataFolder: "app:open-data-folder",
    pickDirectory: "dialog:pickDirectory",
    startSession: "session:start",
    listSessions: "sessions:list",
    stopSession: "session:stop",
    restartSession: "session:restart",
    renameSession: "session:rename",
    removeSession: "session:remove",
    clearSessionHistory: "sessions:clear-history",
    openWorkspaceFile: "editor:openFile",
    saveWorkspaceFile: "editor:saveFile",
    listWorkspaceFiles: "workspace:listFiles",
    listWorkspaceChanges: "workspace:listChanges",
    writeToSession: "session:write",
    resizeSession: "session:resize",
    getSessionProcesses: "session:processes",
    ensureManualTerminal: "manual-terminal:ensure",
    writeToManualTerminal: "manual-terminal:write",
    resizeManualTerminal: "manual-terminal:resize",
    closeManualTerminal: "manual-terminal:close",
    openExternalUrl: "external-link:open",
    readClipboardText: "clipboard:read-text",
    writeClipboardText: "clipboard:write-text",
    createManagedRun: "managed-run:create",
    listManagedRuns: "managed-runs:list",
    getManagedRun: "managed-run:get",
    getManagedRunWorkerDetail: "managed-run:get-worker-detail",
    openManagedRunFile: "managed-run:open-file",
    linkManagedRunShapeSession: "managed-run:link-shape-session",
    saveManagedRunShape: "managed-run:save-shape",
    approveManagedRunShape: "managed-run:approve-shape",
    saveManagedRunShapeDomainProposal: "managed-run:save-shape-domain-proposal",
    refreshManagedRunShapeDocumentation: "managed-run:refresh-shape-documentation",
    generateManagedRunSpec: "managed-run:generate-spec",
    saveManagedRunSpec: "managed-run:save-spec",
    approveManagedRunSpec: "managed-run:approve-spec",
    generateManagedRunTickets: "managed-run:generate-tickets",
    saveManagedRunTickets: "managed-run:save-tickets",
    approveManagedRunTickets: "managed-run:approve-tickets",
    decideManagedRunRevisionCommit: "managed-run:decide-revision-commit",
    generateManagedRunPlan: "managed-run:generate-plan",
    saveManagedRunPlan: "managed-run:save-plan",
    approveManagedRunPlan: "managed-run:approve-plan",
    startManagedRun: "managed-run:start",
    pauseManagedRun: "managed-run:pause",
    cancelManagedRun: "managed-run:cancel",
    retryManagedRunTask: "managed-run:retry-task",
    updateManagedRunTicketBudget: "managed-run:update-ticket-budget",
    recoverManagedRunTicket: "managed-run:recover-ticket",
    updateManagedRunRouting: "managed-run:update-routing",
    acceptManagedRun: "managed-run:accept",
    archiveManagedRun: "managed-run:archive",
    setManagedRunTaskStatus: "managed-run:set-task-status",
    inspectManagedRunRepository: "managed-run:inspect-repository",
  }),
  events: Object.freeze({
    sessionsChanged: "sessions:changed",
    sessionData: "session:data",
    sessionExit: "session:exit",
    manualTerminalData: "manual-terminal:data",
    manualTerminalExit: "manual-terminal:exit",
    workspaceFileChanged: "workspace:file-changed",
    shortcutQuickOpen: "app:shortcut:quick-open",
    shortcutCopyOrInterrupt: "app:shortcut:copy-or-interrupt",
    managedRunChanged: "managed-run:changed",
    managedRunWorkerOutput: "managed-run:worker-output",
  }),
});
// END AUTO-GENERATED IPC CHANNELS

function on(channel, listener) {
  const subscription = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, subscription);

  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
}

const agentic = {
  app: {
    getContext: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.getContext),
    checkCommand: (command) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.checkCommand, command),
    getDiagnostics: () =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.getDiagnostics),
    openDataFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.openDataFolder),
    pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.pickDirectory),
    openExternalUrl: (url) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.openExternalUrl, { url }),
  },
  sessions: {
    start: (options) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.startSession, options),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.listSessions),
    stop: (sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.stopSession, sessionId),
    restart: (sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.restartSession, sessionId),
    rename: (sessionId, label) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.renameSession, {
        sessionId,
        label,
      }),
    remove: (sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.removeSession, sessionId),
    clearHistory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.clearSessionHistory),
    write: (sessionId, input) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.writeToSession, {
        sessionId,
        input,
      }),
    resize: (sessionId, size) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.resizeSession, {
        sessionId,
        cols: size.cols,
        rows: size.rows,
      }),
    getProcesses: (sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.getSessionProcesses, sessionId),
    onChanged: (listener) => on(IPC_CHANNELS.events.sessionsChanged, listener),
    onData: (listener) => on(IPC_CHANNELS.events.sessionData, listener),
    onExit: (listener) => on(IPC_CHANNELS.events.sessionExit, listener),
  },
  shortcuts: {
    onQuickOpen: (listener) =>
      on(IPC_CHANNELS.events.shortcutQuickOpen, listener),
    onCopyOrInterrupt: (listener) =>
      on(IPC_CHANNELS.events.shortcutCopyOrInterrupt, listener),
  },
  workspace: {
    openFile: (sessionId, filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.openWorkspaceFile, {
        sessionId,
        filePath,
      }),
    saveFile: (sessionId, filePath, content) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.saveWorkspaceFile, {
        sessionId,
        filePath,
        content,
      }),
    listFiles: (payload) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.listWorkspaceFiles, payload),
    listChanges: (sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.listWorkspaceChanges, {
        sessionId,
      }),
    onFileChanged: (listener) =>
      on(IPC_CHANNELS.events.workspaceFileChanged, listener),
  },
  manualTerminals: {
    ensure: (sessionId, terminalId = "1") =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.ensureManualTerminal, {
        sessionId,
        terminalId,
      }),
    write: (sessionId, input, terminalId = "1") =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.writeToManualTerminal, {
        sessionId,
        input,
        terminalId,
      }),
    resize: (sessionId, size, terminalId = "1") =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.resizeManualTerminal, {
        sessionId,
        terminalId,
        cols: size.cols,
        rows: size.rows,
      }),
    close: (sessionId, terminalId = "1") =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.closeManualTerminal, {
        sessionId,
        terminalId,
      }),
    onData: (listener) => on(IPC_CHANNELS.events.manualTerminalData, listener),
    onExit: (listener) => on(IPC_CHANNELS.events.manualTerminalExit, listener),
  },
  managedRuns: {
    create: (payload) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.createManagedRun, payload),
    inspectRepository: (repoPath) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.invoke.inspectManagedRunRepository,
        repoPath,
      ),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.listManagedRuns),
    get: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.getManagedRun, runId),
    getWorkerDetail: (runId, workerId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.getManagedRunWorkerDetail, {
        runId,
        workerId,
      }),
    openFile: (runId, filePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.openManagedRunFile, {
        runId,
        filePath,
      }),
    linkShapeSession: (runId, sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.linkManagedRunShapeSession, { runId, sessionId }),
    saveShape: (runId, markdown) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.saveManagedRunShape, { runId, markdown }),
    approveShape: (runId, options = {}) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.approveManagedRunShape, { runId, options }),
    saveShapeDomainProposal: (runId, markdown) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.saveManagedRunShapeDomainProposal, { runId, markdown }),
    refreshShapeDocumentation: (runId, options = {}) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.refreshManagedRunShapeDocumentation, { runId, options }),
    generateSpec: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.generateManagedRunSpec, runId),
    saveSpec: (runId, markdown) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.saveManagedRunSpec, { runId, markdown }),
    approveSpec: (runId, options = {}) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.approveManagedRunSpec, { runId, options }),
    generateTickets: (runId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.generateManagedRunTickets, runId),
    saveTickets: (runId, markdown) => ipcRenderer.invoke(IPC_CHANNELS.invoke.saveManagedRunTickets, { runId, markdown }),
    approveTickets: (runId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.approveManagedRunTickets, runId),
    decideRevisionCommit: (runId, ticketId, disposition, reversalTicketId = null) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.decideManagedRunRevisionCommit, { runId, ticketId, disposition, reversalTicketId }),
    generatePlan: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.generateManagedRunPlan, runId),
    savePlan: (runId, plan) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.saveManagedRunPlan, { runId, plan }),
    approvePlan: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.approveManagedRunPlan, runId),
    start: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.startManagedRun, runId),
    pause: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.pauseManagedRun, runId),
    cancel: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.cancelManagedRun, runId),
    retryTask: (runId, taskId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.retryManagedRunTask, { runId, taskId }),
    updateTicketBudget: (runId, taskId, maxAttempts) => ipcRenderer.invoke(IPC_CHANNELS.invoke.updateManagedRunTicketBudget, { runId, taskId, maxAttempts }),
    recoverTicket: (runId, taskId, action, confirmed = false) => ipcRenderer.invoke(IPC_CHANNELS.invoke.recoverManagedRunTicket, { runId, taskId, action, confirmed }),
    updateRouting: (runId, routing) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.updateManagedRunRouting, {
        runId,
        routing,
      }),
    accept: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.acceptManagedRun, runId),
    archive: (runId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.archiveManagedRun, runId),
    setTaskStatus: (runId, taskId, status) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.setManagedRunTaskStatus, {
        runId,
        taskId,
        status,
      }),
    onChanged: (listener) =>
      on(IPC_CHANNELS.events.managedRunChanged, listener),
    onWorkerOutput: (listener) =>
      on(IPC_CHANNELS.events.managedRunWorkerOutput, listener),
  },
  clipboard: {
    readText: async () => {
      if (clipboard && typeof clipboard.readText === "function") {
        return clipboard.readText();
      }

      return ipcRenderer.invoke(IPC_CHANNELS.invoke.readClipboardText);
    },
    writeText: async (value) => {
      const resolved = value || "";
      if (clipboard && typeof clipboard.writeText === "function") {
        clipboard.writeText(resolved);
        return;
      }

      await ipcRenderer.invoke(
        IPC_CHANNELS.invoke.writeClipboardText,
        resolved,
      );
    },
  },
};

contextBridge.exposeInMainWorld("agentic", agentic);
