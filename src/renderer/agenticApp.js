/** @typedef {import("../shared/ipcContract.js").AgenticAppApi} AgenticAppApi */

function getBridge() {
  return window.agentic;
}

function bridgeUnavailableError() {
  return new Error(
    "Electron bridge is unavailable. Ensure preload is loaded and contextBridge is configured.",
  );
}

function requireSection(sectionName) {
  const bridge = getBridge();
  const section = bridge?.[sectionName];
  if (!section) {
    throw bridgeUnavailableError();
  }

  return section;
}

function call(sectionName, methodName, ...args) {
  try {
    const section = requireSection(sectionName);
    const method = section?.[methodName];
    if (typeof method !== "function") {
      throw bridgeUnavailableError();
    }

    return method(...args);
  } catch (error) {
    return Promise.reject(error);
  }
}

function subscribe(sectionName, methodName, listener) {
  const noopUnsubscribe = () => {};

  try {
    const section = requireSection(sectionName);
    const method = section?.[methodName];
    if (typeof method !== "function") {
      console.error(bridgeUnavailableError().message);
      return noopUnsubscribe;
    }

    const unsubscribe = method(listener);
    return typeof unsubscribe === "function" ? unsubscribe : noopUnsubscribe;
  } catch (error) {
    console.error(error.message || String(error));
    return noopUnsubscribe;
  }
}

/** @type {AgenticAppApi} */
export const agenticApp = Object.freeze({
  getContext: () => call("app", "getContext"),
  checkCommand: (command) => call("app", "checkCommand", command),
  getDiagnostics: () => call("app", "getDiagnostics"),
  openDataFolder: () => call("app", "openDataFolder"),
  pickDirectory: () => call("app", "pickDirectory"),
  startSession: (options) => call("sessions", "start", options),
  listSessions: () => call("sessions", "list"),
  stopSession: (sessionId) => call("sessions", "stop", sessionId),
  restartSession: (sessionId) => call("sessions", "restart", sessionId),
  renameSession: (sessionId, label) =>
    call("sessions", "rename", sessionId, label),
  removeSession: (sessionId) => call("sessions", "remove", sessionId),
  clearSessionHistory: () => call("sessions", "clearHistory"),
  openWorkspaceFile: (sessionId, filePath) =>
    call("workspace", "openFile", sessionId, filePath),
  saveWorkspaceFile: (sessionId, filePath, content) =>
    call("workspace", "saveFile", sessionId, filePath, content),
  listWorkspaceFiles: (payload) => call("workspace", "listFiles", payload),
  listWorkspaceChanges: (sessionId) =>
    call("workspace", "listChanges", sessionId),
  writeToSession: (sessionId, input) =>
    call("sessions", "write", sessionId, input),
  resizeSession: (sessionId, size) =>
    call("sessions", "resize", sessionId, size),
  getSessionProcesses: (sessionId) =>
    call("sessions", "getProcesses", sessionId),
  ensureManualTerminal: (sessionId, terminalId = "1") =>
    call("manualTerminals", "ensure", sessionId, terminalId),
  writeToManualTerminal: (sessionId, input, terminalId = "1") =>
    call("manualTerminals", "write", sessionId, input, terminalId),
  resizeManualTerminal: (sessionId, size, terminalId = "1") =>
    call("manualTerminals", "resize", sessionId, size, terminalId),
  closeManualTerminal: (sessionId, terminalId = "1") =>
    call("manualTerminals", "close", sessionId, terminalId),
  createManagedRun: (payload) => call("managedRuns", "create", payload),
  inspectManagedRunRepository: (repoPath) =>
    call("managedRuns", "inspectRepository", repoPath),
  listManagedRuns: () => call("managedRuns", "list"),
  getManagedRun: (runId) => call("managedRuns", "get", runId),
  getManagedRunWorkerDetail: (runId, workerId) =>
    call("managedRuns", "getWorkerDetail", runId, workerId),
  openManagedRunFile: (runId, filePath) =>
    call("managedRuns", "openFile", runId, filePath),
  linkManagedRunShapeSession: (runId, sessionId) =>
    call("managedRuns", "linkShapeSession", runId, sessionId),
  saveManagedRunShape: (runId, markdown) =>
    call("managedRuns", "saveShape", runId, markdown),
  approveManagedRunShape: (runId, options = {}) =>
    call("managedRuns", "approveShape", runId, options),
  saveManagedRunShapeDomainProposal: (runId, markdown) =>
    call("managedRuns", "saveShapeDomainProposal", runId, markdown),
  refreshManagedRunShapeDocumentation: (runId, options = {}) =>
    call("managedRuns", "refreshShapeDocumentation", runId, options),
  generateManagedRunSpec: (runId) => call("managedRuns", "generateSpec", runId),
  saveManagedRunSpec: (runId, markdown) => call("managedRuns", "saveSpec", runId, markdown),
  approveManagedRunSpec: (runId, options = {}) => call("managedRuns", "approveSpec", runId, options),
  generateManagedRunPlan: (runId) =>
    call("managedRuns", "generatePlan", runId),
  saveManagedRunPlan: (runId, plan) =>
    call("managedRuns", "savePlan", runId, plan),
  approveManagedRunPlan: (runId) =>
    call("managedRuns", "approvePlan", runId),
  startManagedRun: (runId) => call("managedRuns", "start", runId),
  pauseManagedRun: (runId) => call("managedRuns", "pause", runId),
  cancelManagedRun: (runId) => call("managedRuns", "cancel", runId),
  retryManagedRunTask: (runId, taskId) =>
    call("managedRuns", "retryTask", runId, taskId),
  updateManagedRunRouting: (runId, routing) =>
    call("managedRuns", "updateRouting", runId, routing),
  acceptManagedRun: (runId) => call("managedRuns", "accept", runId),
  archiveManagedRun: (runId) => call("managedRuns", "archive", runId),
  setManagedRunTaskStatus: (runId, taskId, status) =>
    call("managedRuns", "setTaskStatus", runId, taskId, status),
  openExternalUrl: (url) => call("app", "openExternalUrl", url),
  readClipboardText: async () => {
    try {
      const clipboardSection = requireSection("clipboard");
      if (typeof clipboardSection.readText !== "function") {
        return "";
      }

      return (await clipboardSection.readText()) || "";
    } catch {
      return "";
    }
  },
  writeClipboardText: async (value) => {
    try {
      const clipboardSection = requireSection("clipboard");
      if (typeof clipboardSection.writeText === "function") {
        await clipboardSection.writeText(value);
      }
    } catch {
      // Ignore clipboard writes when bridge is unavailable.
    }
  },
  onSessionsChanged: (listener) => subscribe("sessions", "onChanged", listener),
  onSessionData: (listener) => subscribe("sessions", "onData", listener),
  onSessionExit: (listener) => subscribe("sessions", "onExit", listener),
  onManualTerminalData: (listener) =>
    subscribe("manualTerminals", "onData", listener),
  onManualTerminalExit: (listener) =>
    subscribe("manualTerminals", "onExit", listener),
  onWorkspaceFileChanged: (listener) =>
    subscribe("workspace", "onFileChanged", listener),
  onManagedRunChanged: (listener) =>
    subscribe("managedRuns", "onChanged", listener),
  onManagedRunWorkerOutput: (listener) =>
    subscribe("managedRuns", "onWorkerOutput", listener),
  onQuickOpenShortcut: (listener) =>
    subscribe("shortcuts", "onQuickOpen", listener),
  onCopyOrInterruptShortcut: (listener) =>
    subscribe("shortcuts", "onCopyOrInterrupt", listener),
});
