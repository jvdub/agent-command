export const sessions = new Map();
export const sessionBuffers = new Map();
export const sessionInsights = new Map();
export const sessionTerminals = new Map();
export const manualTerminals = new Map();
export const manualTerminalBuffers = new Map();
export const sessionProcesses = new Map();
export const sessionFileReferences = new Map();
export const workspaceFilesCache = new Map();

export const capabilities = {
  processInspectionSupported: true,
};

export const uiState = {
  activeSessionId: null,
  refreshScheduled: false,
  refreshTimeoutId: null,
  isProcessPanelOpen: false,
  terminalContextTarget: null,
  isAgentSearchOpen: false,
  defaultWorkspaceRoot: "",
  isWorkspaceSearchOpen: false,
  platformName: "linux",
};

export const editorRuntime = {
  monacoEditor: null,
  monacoApi: null,
  monacoLoaderPromise: null,
  editorModel: null,
  autosaveTimeoutId: null,
  suppressEditorChange: false,
};

export const editorState = {
  open: false,
  sessionId: null,
  filePath: "",
  relativePath: "",
  dirty: false,
  autosave: false,
};

export const workspaceSearchState = {
  root: "",
  files: [],
  filtered: [],
  activeIndex: 0,
  loading: false,
  query: "",
};

export function manualTerminalKey(sessionId, terminalId) {
  return `${sessionId}:${terminalId}`;
}
