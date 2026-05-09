const { clipboard, contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agenticApp", {
  getContext: () => ipcRenderer.invoke("app:getContext"),
  pickDirectory: () => ipcRenderer.invoke("dialog:pickDirectory"),
  startSession: (options) => ipcRenderer.invoke("session:start", options),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  stopSession: (sessionId) => ipcRenderer.invoke("session:stop", sessionId),
  restartSession: (sessionId) => ipcRenderer.invoke("session:restart", sessionId),
  removeSession: (sessionId) => ipcRenderer.invoke("session:remove", sessionId),
  writeToSession: (sessionId, input) =>
    ipcRenderer.invoke("session:write", { sessionId, input }),
  resizeSession: (sessionId, size) =>
    ipcRenderer.invoke("session:resize", {
      sessionId,
      cols: size.cols,
      rows: size.rows,
    }),
  getSessionProcesses: (sessionId) =>
    ipcRenderer.invoke("session:processes", sessionId),
  ensureManualTerminal: (sessionId) =>
    ipcRenderer.invoke("manual-terminal:ensure", sessionId),
  writeToManualTerminal: (sessionId, input) =>
    ipcRenderer.invoke("manual-terminal:write", { sessionId, input }),
  resizeManualTerminal: (sessionId, size) =>
    ipcRenderer.invoke("manual-terminal:resize", {
      sessionId,
      cols: size.cols,
      rows: size.rows,
    }),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (value) => clipboard.writeText(value || ""),
  onSessionsChanged: (listener) => {
    const subscription = (_event, payload) => listener(payload);
    ipcRenderer.on("sessions:changed", subscription);

    return () => {
      ipcRenderer.removeListener("sessions:changed", subscription);
    };
  },
  onSessionData: (listener) => {
    const subscription = (_event, payload) => listener(payload);
    ipcRenderer.on("session:data", subscription);

    return () => {
      ipcRenderer.removeListener("session:data", subscription);
    };
  },
  onSessionExit: (listener) => {
    const subscription = (_event, payload) => listener(payload);
    ipcRenderer.on("session:exit", subscription);

    return () => {
      ipcRenderer.removeListener("session:exit", subscription);
    };
  },
  onManualTerminalData: (listener) => {
    const subscription = (_event, payload) => listener(payload);
    ipcRenderer.on("manual-terminal:data", subscription);

    return () => {
      ipcRenderer.removeListener("manual-terminal:data", subscription);
    };
  },
  onManualTerminalExit: (listener) => {
    const subscription = (_event, payload) => listener(payload);
    ipcRenderer.on("manual-terminal:exit", subscription);

    return () => {
      ipcRenderer.removeListener("manual-terminal:exit", subscription);
    };
  },
});
