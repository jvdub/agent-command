/**
 * Features Registry and Factory
 *
 * Central place for creating and initializing all feature modules.
 * Features are modular, UI-specific components that respond to commands
 * and render UI elements without mutating global state directly.
 */

import { createSessionPanel } from "./sessionPanel/index.js";
import { createTerminalView } from "./terminalView/index.js";
import { createFileEditor } from "./fileEditor/index.js";

/**
 * Creates all feature modules with their dependencies
 * @param {Object} config - Configuration object
 * @param {CommandDispatcher} config.dispatcher - Command dispatcher instance
 * @param {StateManager} config.stateManager - State manager instance
 * @param {Object} config.appState - App state object containing Maps like sessions, etc.
 * @param {Map} config.appState.sessions - All sessions
 * @param {Map} config.appState.sessionProcesses - Session processes
 * @param {Map} config.appState.sessionTerminals - Session terminals
 * @param {Map} config.appState.sessionBuffers - Session buffers
 * @param {Map} config.appState.manualTerminals - Manual terminals
 * @param {Map} config.appState.manualTerminalBuffers - Manual terminal buffers
 * @param {Object} config.elements - DOM element references
 * @param {Function} config.deriveAttentionStatus - Function to derive attention status
 * @param {Function} config.getProcessDisplayLabel - Function to get process display label
 * @param {Function} config.markSessionInput - Function to mark session input
 * @param {Function} config.scheduleUiRefresh - Function to schedule UI refresh
 * @param {Function} config.setStatus - Function to set status
 * @returns {Object} Object with all initialized features
 */
export function createFeatures({
  dispatcher,
  stateManager,
  appState,
  elements,
  deriveAttentionStatus,
  getProcessDisplayLabel,
  markSessionInput,
  scheduleUiRefresh,
  setStatus,
}) {
  if (!dispatcher) throw new Error("dispatcher is required");
  if (!stateManager) throw new Error("stateManager is required");
  if (!appState) throw new Error("appState is required");
  if (!elements) throw new Error("elements is required");
  if (typeof deriveAttentionStatus !== "function")
    throw new Error("deriveAttentionStatus is required");
  if (typeof getProcessDisplayLabel !== "function")
    throw new Error("getProcessDisplayLabel is required");

  const sessionPanel = createSessionPanel({
    dispatcher,
    elements,
    deriveAttentionStatus,
    sessionProcesses: appState.sessionProcesses,
    getProcessDisplayLabel,
  });

  const terminalView = createTerminalView({
    dispatcher,
    stateManager,
    elements,
    appState: {
      sessions: appState.sessions,
      sessionTerminals: appState.sessionTerminals,
      sessionBuffers: appState.sessionBuffers,
      uiState: appState.uiState,
      manualTerminals: appState.manualTerminals,
      manualTerminalBuffers: appState.manualTerminalBuffers,
      manualTerminalKey: appState.manualTerminalKey,
    },
    markSessionInput,
    scheduleUiRefresh,
    setStatus,
  });

  const fileEditor = createFileEditor({
    dispatcher,
    stateManager,
    elements,
    appState: {
      sessions: appState.sessions,
      editorState: appState.editorState,
      editorRuntime: appState.editorRuntime,
      uiState: appState.uiState,
      workspaceFilesCache: appState.workspaceFilesCache,
      workspaceSearchState: appState.workspaceSearchState,
    },
    getActiveTerminalInstance: () => terminalView.getActiveTerminalInstance(),
    setStatus,
  });

  // Wire dispatcher event: file reference clicked → open file
  if (typeof fileEditor.setupDispatcherListeners === "function") {
    fileEditor.setupDispatcherListeners(dispatcher);
  } else {
    dispatcher.on(
      "fileReferenceClicked",
      ({ sessionId, filePath, lineNumber }) => {
        fileEditor.openReferencedFile(sessionId, filePath, lineNumber);
      },
    );
  }

  return {
    sessionPanel,
    terminalView,
    fileEditor,

    /**
     * Get a feature by name for debugging/testing
     * @param {string} name - Feature name
     * @returns {Object|undefined}
     */
    getFeature(name) {
      const features = {
        sessionPanel,
        terminalView,
        fileEditor,
      };
      return features[name];
    },

    /**
     * List all available features
     * @returns {Array<string>}
     */
    listFeatures() {
      return ["sessionPanel", "terminalView", "fileEditor"];
    },
  };
}
