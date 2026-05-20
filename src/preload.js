const { clipboard, contextBridge, ipcRenderer } = require("electron");

// In sandboxed preload contexts, local file requires are not available.
// Keep the bridge contract local to this file so preload can initialize.
const IPC_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    getContext: "app:getContext",
    pickDirectory: "dialog:pickDirectory",
    startSession: "session:start",
    listSessions: "sessions:list",
    stopSession: "session:stop",
    restartSession: "session:restart",
    removeSession: "session:remove",
    openWorkspaceFile: "editor:openFile",
    saveWorkspaceFile: "editor:saveFile",
    listWorkspaceFiles: "workspace:listFiles",
    writeToSession: "session:write",
    resizeSession: "session:resize",
    getSessionProcesses: "session:processes",
    ensureManualTerminal: "manual-terminal:ensure",
    writeToManualTerminal: "manual-terminal:write",
    resizeManualTerminal: "manual-terminal:resize",
    openExternalUrl: "external-link:open",
  }),
  events: Object.freeze({
    sessionsChanged: "sessions:changed",
    sessionData: "session:data",
    sessionExit: "session:exit",
    manualTerminalData: "manual-terminal:data",
    manualTerminalExit: "manual-terminal:exit",
  }),
});

function buildExternalLinkRequest(url) {
  return { url };
}

function buildOpenWorkspaceFileRequest(sessionId, filePath) {
  return { sessionId, filePath };
}

function buildSaveWorkspaceFileRequest(sessionId, filePath, content) {
  return { sessionId, filePath, content };
}

function buildSessionWriteRequest(sessionId, input) {
  return { sessionId, input };
}

function buildSessionResizeRequest(sessionId, size) {
  return {
    sessionId,
    cols: size.cols,
    rows: size.rows,
  };
}

function buildManualTerminalEnsureRequest(sessionId, terminalId = "1") {
  return {
    sessionId,
    terminalId: String(terminalId || "1"),
  };
}

function buildManualTerminalWriteRequest(sessionId, input, terminalId = "1") {
  return {
    sessionId,
    input,
    terminalId: String(terminalId || "1"),
  };
}

function buildManualTerminalResizeRequest(sessionId, size, terminalId = "1") {
  return {
    sessionId,
    terminalId: String(terminalId || "1"),
    cols: size.cols,
    rows: size.rows,
  };
}

function normalizeSessionProcessesResponse(result) {
  if (Array.isArray(result)) {
    return { processes: result, supported: true };
  }

  return {
    processes: Array.isArray(result?.processes) ? result.processes : [],
    supported: result?.supported !== false,
  };
}

function freezeBridgeSection(section) {
  return Object.freeze(section);
}

function invoke(channel, payload) {
  if (typeof payload === "undefined") {
    return ipcRenderer.invoke(channel);
  }

  return ipcRenderer.invoke(channel, payload);
}

function subscribeToChannel(channel, listener) {
  if (typeof listener !== "function") {
    throw new TypeError("Listener must be a function.");
  }

  const subscription = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, subscription);

  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
}

const agenticBridge = Object.freeze({
  app: freezeBridgeSection({
    getContext: async () => {
      const context = await invoke(IPC_CHANNELS.invoke.getContext);
      return {
        ...context,
        processInspectionSupported:
          context?.processInspectionSupported !== false,
      };
    },
    pickDirectory: () => invoke(IPC_CHANNELS.invoke.pickDirectory),
    openExternalUrl: (url) =>
      invoke(
        IPC_CHANNELS.invoke.openExternalUrl,
        buildExternalLinkRequest(url),
      ),
  }),
  sessions: freezeBridgeSection({
    start: (options) => invoke(IPC_CHANNELS.invoke.startSession, options),
    list: () => invoke(IPC_CHANNELS.invoke.listSessions),
    stop: (sessionId) => invoke(IPC_CHANNELS.invoke.stopSession, sessionId),
    restart: (sessionId) =>
      invoke(IPC_CHANNELS.invoke.restartSession, sessionId),
    remove: (sessionId) => invoke(IPC_CHANNELS.invoke.removeSession, sessionId),
    write: (sessionId, input) =>
      invoke(
        IPC_CHANNELS.invoke.writeToSession,
        buildSessionWriteRequest(sessionId, input),
      ),
    resize: (sessionId, size) =>
      invoke(
        IPC_CHANNELS.invoke.resizeSession,
        buildSessionResizeRequest(sessionId, size),
      ),
    getProcesses: async (sessionId) => {
      const result = await invoke(
        IPC_CHANNELS.invoke.getSessionProcesses,
        sessionId,
      );
      return normalizeSessionProcessesResponse(result);
    },
    onChanged: (listener) =>
      subscribeToChannel(IPC_CHANNELS.events.sessionsChanged, listener),
    onData: (listener) =>
      subscribeToChannel(IPC_CHANNELS.events.sessionData, listener),
    onExit: (listener) =>
      subscribeToChannel(IPC_CHANNELS.events.sessionExit, listener),
  }),
  manualTerminals: freezeBridgeSection({
    ensure: (sessionId, terminalId = "1") =>
      invoke(
        IPC_CHANNELS.invoke.ensureManualTerminal,
        buildManualTerminalEnsureRequest(sessionId, terminalId),
      ),
    write: (sessionId, input, terminalId = "1") =>
      invoke(
        IPC_CHANNELS.invoke.writeToManualTerminal,
        buildManualTerminalWriteRequest(sessionId, input, terminalId),
      ),
    resize: (sessionId, size, terminalId = "1") =>
      invoke(
        IPC_CHANNELS.invoke.resizeManualTerminal,
        buildManualTerminalResizeRequest(sessionId, size, terminalId),
      ),
    onData: (listener) =>
      subscribeToChannel(IPC_CHANNELS.events.manualTerminalData, listener),
    onExit: (listener) =>
      subscribeToChannel(IPC_CHANNELS.events.manualTerminalExit, listener),
  }),
  workspace: freezeBridgeSection({
    openFile: (sessionId, filePath) =>
      invoke(
        IPC_CHANNELS.invoke.openWorkspaceFile,
        buildOpenWorkspaceFileRequest(sessionId, filePath),
      ),
    saveFile: (sessionId, filePath, content) =>
      invoke(
        IPC_CHANNELS.invoke.saveWorkspaceFile,
        buildSaveWorkspaceFileRequest(sessionId, filePath, content),
      ),
    listFiles: (payload) =>
      invoke(IPC_CHANNELS.invoke.listWorkspaceFiles, payload),
  }),
  clipboard: freezeBridgeSection({
    readText: () => clipboard.readText(),
    writeText: (value) => clipboard.writeText(value || ""),
  }),
});

contextBridge.exposeInMainWorld("agentic", agenticBridge);
