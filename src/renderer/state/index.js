import { createDataStore } from "./dataStore.js";
import { createStateManager } from "./stateManager.js";

export { createStateManager, createDataStore };

export const defaultStateManager = createStateManager();
export const defaultDataStore = createDataStore(defaultStateManager);

const mutableState = defaultStateManager.getMutableStateForMigration();

export const sessions = mutableState.data.sessions;
export const sessionBuffers = mutableState.data.sessionBuffers;
export const sessionInsights = mutableState.data.sessionInsights;
export const sessionProcesses = mutableState.data.sessionProcesses;

// Runtime-owned terminal instances are still stored as module-level Maps.
export const sessionTerminals = new Map();
export const manualTerminals = new Map();
export const manualTerminalBuffers = new Map();
export const sessionFileReferences = new Map();
export const workspaceFilesCache = new Map();

export const capabilities = mutableState.app.capabilities;
export const uiState = mutableState.app.uiState;

export const editorRuntime = {
  monacoApi: null,
  monacoEditor: null,
  monacoLoaderPromise: null,
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

export function manualTerminalKey(sessionId, terminalId = "1") {
  return `${sessionId}:${String(terminalId || "1")}`;
}

export function ensureSessionBuffer(sessionId) {
  if (!sessionBuffers.has(sessionId)) {
    sessionBuffers.set(sessionId, "");
  }

  return sessionBuffers.get(sessionId);
}

function createDefaultSessionInsight() {
  return {
    lastActivityAt: null,
    lastInputAt: null,
    lastWorkingAt: null,
    lastReadyAt: null,
    workingDetail: null,
    awaitingPermission: false,
    permissionDetail: "",
    awaitingQuestion: false,
    questionDetail: "",
    hasError: false,
    errorMessage: "",
    lastErrorAt: null,
    streamCarry: "",
  };
}

export function ensureSessionInsight(sessionId) {
  if (!sessionInsights.has(sessionId)) {
    sessionInsights.set(sessionId, createDefaultSessionInsight());
  }

  return sessionInsights.get(sessionId);
}

/**
 * Factory function to create default state manager and data store.
 * This avoids global initialization and supports dependency injection.
 */
export function createDefaultState() {
  const stateManager = createStateManager();
  const dataStore = createDataStore(stateManager);

  stateManager.setState("features.terminalView", {
    sessionBuffers: new Map(),
    manualTerminals: new Map(),
  });

  stateManager.setState("features.fileEditor", {
    editorState: {
      open: false,
      sessionId: null,
      filePath: "",
      relativePath: "",
      dirty: false,
      autosave: false,
    },
    workspaceFilesCache: new Map(),
    workspaceSearchState: {
      root: "",
      files: [],
      filtered: [],
      activeIndex: 0,
      loading: false,
      query: "",
    },
  });

  return { stateManager, dataStore };
}
