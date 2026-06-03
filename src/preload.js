const { clipboard, contextBridge, ipcRenderer } = require("electron");

// BEGIN AUTO-GENERATED IPC CHANNELS
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
    readClipboardText: "clipboard:read-text",
    writeClipboardText: "clipboard:write-text",
  }),
  events: Object.freeze({
    sessionsChanged: "sessions:changed",
    sessionData: "session:data",
    sessionExit: "session:exit",
    manualTerminalData: "manual-terminal:data",
    manualTerminalExit: "manual-terminal:exit",
    shortcutQuickOpen: "app:shortcut:quick-open",
    shortcutCopyOrInterrupt: "app:shortcut:copy-or-interrupt",
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
    remove: (sessionId) =>
      ipcRenderer.invoke(IPC_CHANNELS.invoke.removeSession, sessionId),
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
    onData: (listener) => on(IPC_CHANNELS.events.manualTerminalData, listener),
    onExit: (listener) => on(IPC_CHANNELS.events.manualTerminalExit, listener),
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

      await ipcRenderer.invoke(IPC_CHANNELS.invoke.writeClipboardText, resolved);
    },
  },
};

contextBridge.exposeInMainWorld("agentic", agentic);
