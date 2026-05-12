const { clipboard, contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agenticApp", {
  getContext: async () => {
    const context = await ipcRenderer.invoke("app:getContext");
    return {
      ...context,
      processInspectionSupported: context?.processInspectionSupported !== false,
    };
  },
  pickDirectory: () => ipcRenderer.invoke("dialog:pickDirectory"),
  startSession: (options) => ipcRenderer.invoke("session:start", options),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  stopSession: (sessionId) => ipcRenderer.invoke("session:stop", sessionId),
  restartSession: (sessionId) =>
    ipcRenderer.invoke("session:restart", sessionId),
  removeSession: (sessionId) => ipcRenderer.invoke("session:remove", sessionId),
  openWorkspaceFile: (sessionId, filePath) =>
    ipcRenderer.invoke("editor:openFile", { sessionId, filePath }),
  saveWorkspaceFile: (sessionId, filePath, content) =>
    ipcRenderer.invoke("editor:saveFile", { sessionId, filePath, content }),
  writeToSession: (sessionId, input) =>
    ipcRenderer.invoke("session:write", { sessionId, input }),
  resizeSession: (sessionId, size) =>
    ipcRenderer.invoke("session:resize", {
      sessionId,
      cols: size.cols,
      rows: size.rows,
    }),
  getSessionProcesses: async (sessionId) => {
    const result = await ipcRenderer.invoke("session:processes", sessionId);

    if (Array.isArray(result)) {
      return { processes: result, supported: true };
    }

    return {
      processes: Array.isArray(result?.processes) ? result.processes : [],
      supported: result?.supported !== false,
    };
  },
  ensureManualTerminal: (sessionId, terminalId = "1") =>
    ipcRenderer.invoke("manual-terminal:ensure", { sessionId, terminalId }),
  writeToManualTerminal: (sessionId, input, terminalId = "1") =>
    ipcRenderer.invoke("manual-terminal:write", {
      sessionId,
      input,
      terminalId,
    }),
  resizeManualTerminal: (sessionId, size, terminalId = "1") =>
    ipcRenderer.invoke("manual-terminal:resize", {
      sessionId,
      terminalId,
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
