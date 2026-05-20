/** @typedef {import("../shared/ipcContract.js").AgenticAppApi} AgenticAppApi */

const bridge = window.agentic;

function bridgeUnavailableError() {
  return new Error(
    "Electron bridge is unavailable. Ensure preload is loaded and contextBridge is configured.",
  );
}

function requireSection(sectionName) {
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
  pickDirectory: () => call("app", "pickDirectory"),
  startSession: (options) => call("sessions", "start", options),
  listSessions: () => call("sessions", "list"),
  stopSession: (sessionId) => call("sessions", "stop", sessionId),
  restartSession: (sessionId) => call("sessions", "restart", sessionId),
  removeSession: (sessionId) => call("sessions", "remove", sessionId),
  openWorkspaceFile: (sessionId, filePath) =>
    call("workspace", "openFile", sessionId, filePath),
  saveWorkspaceFile: (sessionId, filePath, content) =>
    call("workspace", "saveFile", sessionId, filePath, content),
  listWorkspaceFiles: (payload) => call("workspace", "listFiles", payload),
  writeToSession: (sessionId, input) =>
    call("sessions", "write", sessionId, input),
  resizeSession: (sessionId, size) => call("sessions", "resize", sessionId, size),
  getSessionProcesses: (sessionId) => call("sessions", "getProcesses", sessionId),
  ensureManualTerminal: (sessionId, terminalId = "1") =>
    call("manualTerminals", "ensure", sessionId, terminalId),
  writeToManualTerminal: (sessionId, input, terminalId = "1") =>
    call("manualTerminals", "write", sessionId, input, terminalId),
  resizeManualTerminal: (sessionId, size, terminalId = "1") =>
    call("manualTerminals", "resize", sessionId, size, terminalId),
  openExternalUrl: (url) => call("app", "openExternalUrl", url),
  readClipboardText: () => {
    try {
      const clipboardSection = requireSection("clipboard");
      if (typeof clipboardSection.readText !== "function") {
        return "";
      }

      return clipboardSection.readText();
    } catch {
      return "";
    }
  },
  writeClipboardText: (value) => {
    try {
      const clipboardSection = requireSection("clipboard");
      if (typeof clipboardSection.writeText === "function") {
        clipboardSection.writeText(value);
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
});
