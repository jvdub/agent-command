/**
 * File Editor Feature
 *
 * Manages Monaco editor lifecycle, file operations, autosave, and workspace file search.
 * Owns state under stateManager.features.fileEditor
 */

import { AUTOSAVE_DELAY_MS } from "../../constants.js";
import { elements } from "../../dom.js";
import { agenticApp } from "../../agenticApp.js";
import { escapeHtml, languageForPath, pathBasename } from "../../utils.js";

const MONACO_LOADER_PATH = "./vendor/monaco-editor/min/vs/loader.js";
const MONACO_VS_BASE_PATH = "./vendor/monaco-editor/min/vs";

/**
 * Creates the file editor feature
 * @param {Object} config
 * @param {CommandDispatcher} config.dispatcher
 * @param {StateManager} config.stateManager
 * @param {Object} config.elements - DOM element references
 * @param {Object} config.appState - Legacy app state (sessions, editorState, editorRuntime, uiState, workspaceFilesCache, workspaceSearchState)
 * @param {Function} config.getActiveTerminalInstance
 * @param {Function} config.setStatus
 * @returns {Object} Public API for file editor
 */
export function createFileEditor(config) {
  const {
    dispatcher,
    stateManager,
    elements: elmts,
    getActiveTerminalInstance,
    setStatus,
  } = config;

  function setEditorStatus(message) {
    elmts.fileEditorStatus.textContent = message;
  }

  function setEditorDirtyState(isDirty) {
    const editorState = {
      ...(stateManager.getState("features.fileEditor.editorState") || {}),
      dirty: Boolean(isDirty),
    };
    stateManager.setState("features.fileEditor.editorState", editorState);

    if (editorState.dirty) {
      setEditorStatus("Unsaved changes");
    }
  }

  function uniqueStrings(values) {
    return Array.from(
      new Set(values.filter(Boolean).map((value) => String(value))),
    );
  }

  function monacoLoaderCandidates() {
    const MONACO_LOADER_PATH = "./vendor/monaco-editor/min/vs/loader.js";
    const absolute = new URL(
      MONACO_LOADER_PATH,
      window.location.href,
    ).toString();
    return uniqueStrings([MONACO_LOADER_PATH, absolute]);
  }

  function monacoVsBaseCandidates() {
    const MONACO_VS_BASE_PATH = "./vendor/monaco-editor/min/vs";
    const absolute = new URL(`${MONACO_VS_BASE_PATH}/`, window.location.href)
      .toString()
      .replace(/\/$/, "");
    return uniqueStrings([MONACO_VS_BASE_PATH, absolute]);
  }

  async function openReferencedFile(sessionId, filePath, lineNumber = null) {
    try {
      const file = await agenticApp.openWorkspaceFile(sessionId, filePath);
      const editorState = {
        ...(stateManager.getState("features.fileEditor.editorState") || {}),
        open: true,
        sessionId,
        filePath,
        relativePath: file?.relativePath || filePath,
        dirty: false,
      };
      stateManager.setState("features.fileEditor.editorState", editorState);

      if (elmts.fileEditorPath) {
        elmts.fileEditorPath.textContent = editorState.relativePath;
      }
      if (elmts.fileDrawer) {
        elmts.fileDrawer.classList.remove("hidden");
      }
      if (elmts.fileEditorPanel) {
        elmts.fileEditorPanel.classList.remove("hidden");
      }
      if (elmts.fileEditorEmpty) {
        elmts.fileEditorEmpty.classList.add("hidden");
      }

      setEditorStatus(`Opened ${editorState.relativePath}`);
      if (typeof setStatus === "function") {
        setStatus("Opened", editorState.relativePath);
      }

      return { file, lineNumber };
    } catch (error) {
      const detail = error?.message || String(error || "Unknown error");
      const message = `Unable to open ${filePath} while reading the workspace file: ${detail}`;
      console.error(message, {
        error,
        filePath,
        lineNumber,
        sessionId,
      });
      if (typeof setStatus === "function") {
        setStatus("Error", message);
      }
      setEditorStatus(message);
      throw error;
    }
  }

  function setupDispatcherListeners(targetDispatcher = dispatcher) {
    if (!targetDispatcher || typeof targetDispatcher.on !== "function") {
      return () => {};
    }

    return targetDispatcher.on(
      "fileReferenceClicked",
      ({ sessionId, filePath, lineNumber }) => {
        openReferencedFile(sessionId, filePath, lineNumber);
      },
    );
  }

  return {
    setEditorStatus,
    setEditorDirtyState,
    monacoLoaderCandidates,
    monacoVsBaseCandidates,
    openReferencedFile,
    setupDispatcherListeners,
  };
}
