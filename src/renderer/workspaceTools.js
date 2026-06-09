import { AUTOSAVE_DELAY_MS } from "./constants.js";
import { elements } from "./dom.js";
import { agenticApp } from "./agenticApp.js";
import {
  editorRuntime,
  editorState,
  sessions,
  uiState,
  workspaceFilesCache,
  workspaceSearchState,
} from "./state.js";
import { escapeHtml, languageForPath, pathBasename } from "./utils.js";

const MONACO_LOADER_PATH = "./vendor/monaco-editor/min/vs/loader.js";
const MONACO_VS_BASE_PATH = "./vendor/monaco-editor/min/vs";

function setEditorStatus(message) {
  elements.fileEditorStatus.textContent = message;
}

function setEditorDirtyState(isDirty) {
  editorState.dirty = Boolean(isDirty);
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
  const absolute = new URL(MONACO_LOADER_PATH, window.location.href).toString();
  return uniqueStrings([MONACO_LOADER_PATH, absolute]);
}

function monacoVsBaseCandidates() {
  const absolute = new URL(`${MONACO_VS_BASE_PATH}/`, window.location.href)
    .toString()
    .replace(/\/$/, "");
  return uniqueStrings([MONACO_VS_BASE_PATH, absolute]);
}

function loadMonacoWithVsPath(amdRequire, vsPath) {
  return new Promise((resolve, reject) => {
    amdRequire.config({
      paths: {
        vs: vsPath,
      },
    });

    amdRequire(
      ["vs/editor/editor.main"],
      () => {
        if (!window.monaco?.editor) {
          reject(new Error("Monaco editor API did not initialize."));
          return;
        }

        resolve(window.monaco);
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function ensureMonacoEditor(saveOpenEditorFile) {
  if (editorRuntime.monacoEditor && editorRuntime.monacoApi) {
    return Promise.resolve(editorRuntime.monacoApi);
  }

  if (editorRuntime.monacoLoaderPromise) {
    return editorRuntime.monacoLoaderPromise;
  }

  editorRuntime.monacoLoaderPromise = new Promise((resolve, reject) => {
    const initializeMonaco = async () => {
      const amdRequire = window.require || window.requirejs;
      if (!amdRequire) {
        reject(new Error("Monaco loader is unavailable."));
        return;
      }

      let resolvedApi = null;
      let lastError = null;

      for (const vsPath of monacoVsBaseCandidates()) {
        try {
          resolvedApi = await loadMonacoWithVsPath(amdRequire, vsPath);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!resolvedApi) {
        const detail =
          lastError && String(lastError.message || lastError).trim()
            ? ` ${String(lastError.message || lastError).trim()}`
            : "";
        reject(new Error(`Monaco loader is unavailable.${detail}`));
        return;
      }

      editorRuntime.monacoApi = resolvedApi;
      editorRuntime.monacoEditor = editorRuntime.monacoApi.editor.create(
        elements.fileEditorSurface,
        {
          value: "",
          language: "plaintext",
          automaticLayout: true,
          minimap: { enabled: true },
          fontSize: 13,
          theme: "vs-dark",
        },
      );

      editorRuntime.monacoEditor.onDidChangeModelContent(() => {
        if (editorRuntime.suppressEditorChange || !editorState.open) {
          return;
        }

        setEditorDirtyState(true);

        if (!editorState.autosave) {
          return;
        }

        if (editorRuntime.autosaveTimeoutId) {
          window.clearTimeout(editorRuntime.autosaveTimeoutId);
        }

        editorRuntime.autosaveTimeoutId = window.setTimeout(() => {
          editorRuntime.autosaveTimeoutId = null;
          saveOpenEditorFile("Auto-saved");
        }, AUTOSAVE_DELAY_MS);
      });

      resolve(editorRuntime.monacoApi);
    };

    if (window.require || window.requirejs) {
      initializeMonaco();
      return;
    }

    const existingLoader = document.querySelector(
      'script[data-monaco-loader="1"]',
    );
    if (existingLoader) {
      if (existingLoader.readyState === "complete") {
        initializeMonaco();
        return;
      }

      existingLoader.addEventListener("load", initializeMonaco, { once: true });
      existingLoader.addEventListener(
        "error",
        () => reject(new Error("Monaco loader is unavailable.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("data-monaco-loader", "1");
    const [firstLoaderPath, ...fallbackLoaderPaths] = monacoLoaderCandidates();
    script.src = firstLoaderPath;
    script.onload = initializeMonaco;
    script.onerror = () => {
      if (fallbackLoaderPaths.length > 0) {
        script.src = fallbackLoaderPaths[0];
        return;
      }

      reject(new Error("Monaco loader is unavailable."));
    };
    document.head.appendChild(script);
  });

  return editorRuntime.monacoLoaderPromise.catch((error) => {
    editorRuntime.monacoLoaderPromise = null;
    throw error;
  });
}

function getWorkspaceRootForSearch() {
  const active = uiState.activeSessionId
    ? sessions.get(uiState.activeSessionId)
    : null;
  return (
    active?.cwd ||
    uiState.defaultWorkspaceRoot ||
    elements.cwdInput.value.trim() ||
    ""
  );
}

function normalizeWorkspaceSearchText(value) {
  return String(value || "")
    .trim()
    .replace(/\\+/g, "/")
    .toLowerCase();
}

async function loadWorkspaceFiles(root) {
  if (!root) {
    return [];
  }

  if (workspaceFilesCache.has(root)) {
    return workspaceFilesCache.get(root);
  }

  const result = await agenticApp.listWorkspaceFiles({
    sessionId: uiState.activeSessionId,
    root,
  });

  const files = Array.isArray(result?.files) ? result.files : [];
  const sorted = files
    .map((entry) => ({
      absolutePath: String(entry.absolutePath || ""),
      relativePath: String(entry.relativePath || ""),
      basename: String(
        entry.basename ||
          pathBasename(entry.relativePath || entry.absolutePath || ""),
      ),
    }))
    .filter((entry) => entry.absolutePath && entry.relativePath)
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );

  workspaceFilesCache.set(root, sorted);
  return sorted;
}

function scoreWorkspaceFile(entry, query) {
  if (!query) {
    return 0;
  }

  const normalizedQuery = normalizeWorkspaceSearchText(query);
  const relativePath = normalizeWorkspaceSearchText(entry.relativePath);
  const basename = normalizeWorkspaceSearchText(entry.basename);
  const absolutePath = normalizeWorkspaceSearchText(entry.absolutePath);

  if (
    basename === normalizedQuery ||
    relativePath === normalizedQuery ||
    absolutePath === normalizedQuery
  ) {
    return 0;
  }

  if (
    basename.startsWith(normalizedQuery) ||
    relativePath.startsWith(normalizedQuery) ||
    absolutePath.startsWith(normalizedQuery)
  ) {
    return 1;
  }

  if (basename.includes(normalizedQuery)) {
    return 2;
  }

  if (
    relativePath.includes(normalizedQuery) ||
    absolutePath.includes(normalizedQuery)
  ) {
    return 3;
  }

  return Number.POSITIVE_INFINITY;
}

function filterWorkspaceFiles(query, files) {
  const normalizedQuery = normalizeWorkspaceSearchText(query);
  if (!normalizedQuery) {
    return files.slice(0, 100);
  }

  return files
    .map((entry) => ({
      entry,
      score: scoreWorkspaceFile(entry, normalizedQuery),
    }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.entry.relativePath.localeCompare(
        right.entry.relativePath,
        undefined,
        {
          sensitivity: "base",
          numeric: true,
        },
      );
    })
    .slice(0, 100)
    .map(({ entry }) => entry);
}

function renderWorkspaceSearchResults() {
  if (!uiState.isWorkspaceSearchOpen) {
    elements.workspaceSearchResults.innerHTML = "";
    elements.workspaceSearchCount.textContent = "";
    return;
  }

  if (workspaceSearchState.loading) {
    elements.workspaceSearchCount.textContent = "Loading workspace files…";
    elements.workspaceSearchResults.innerHTML =
      '<div class="workspace-search-empty">Scanning workspace files…</div>';
    return;
  }

  const results = workspaceSearchState.filtered;
  elements.workspaceSearchCount.textContent = results.length
    ? `${results.length} file${results.length === 1 ? "" : "s"}`
    : "No matching files";

  if (results.length === 0) {
    elements.workspaceSearchResults.innerHTML =
      '<div class="workspace-search-empty">No files matched the current query.</div>';
    return;
  }

  elements.workspaceSearchResults.innerHTML = results
    .map((entry, index) => {
      const isActive = index === workspaceSearchState.activeIndex;
      return `
        <button
          type="button"
          class="workspace-search-result ${isActive ? "active" : ""}"
          data-file-path="${escapeHtml(entry.absolutePath)}"
          data-file-relative-path="${escapeHtml(entry.relativePath)}"
        >
          <div class="workspace-search-result-main">
            <p class="workspace-search-result-name">${escapeHtml(entry.basename)}</p>
            <p class="workspace-search-result-path">${escapeHtml(entry.relativePath)}</p>
          </div>
        </button>
      `;
    })
    .join("");
}

function applyWorkspaceSearchQuery(query) {
  workspaceSearchState.query = query;
  workspaceSearchState.filtered = filterWorkspaceFiles(
    query,
    workspaceSearchState.files,
  );
  workspaceSearchState.activeIndex = Math.min(
    workspaceSearchState.activeIndex,
    Math.max(0, workspaceSearchState.filtered.length - 1),
  );
  renderWorkspaceSearchResults();
}

function getActiveWorkspaceSearchResult() {
  if (!workspaceSearchState.filtered.length) {
    return null;
  }

  return (
    workspaceSearchState.filtered[workspaceSearchState.activeIndex] ||
    workspaceSearchState.filtered[0] ||
    null
  );
}

export function createWorkspaceTools({
  getActiveTerminalInstance,
  setStatus,
  registerUiBindings = true,
  initializeAutosave = true,
}) {
  async function saveOpenEditorFile(successLabel = "Saved") {
    if (!editorState.open || !editorState.sessionId || !editorState.filePath) {
      return;
    }

    if (!editorRuntime.monacoEditor) {
      return;
    }

    try {
      elements.fileEditorSaveButton.disabled = true;
      const content = editorRuntime.monacoEditor.getValue();
      await agenticApp.saveWorkspaceFile(
        editorState.sessionId,
        editorState.filePath,
        content,
      );
      editorState.dirty = false;
      setEditorStatus(`${successLabel} ${editorState.relativePath}`);
      setStatus("Saved", editorState.relativePath);
    } catch (error) {
      setEditorStatus(error.message || "Unable to save file");
      setStatus("Error", error.message || "Unable to save file");
    } finally {
      elements.fileEditorSaveButton.disabled = false;
    }
  }

  async function openReferencedFile(sessionId, filePath, lineNumber = null) {
    let openStage = "reading the workspace file";

    try {
      const file = await agenticApp.openWorkspaceFile(sessionId, filePath);
      openStage = "loading the workspace editor";
      await ensureMonacoEditor(saveOpenEditorFile);

      openStage = "creating the editor model";
      editorRuntime.suppressEditorChange = true;

      if (editorRuntime.editorModel) {
        editorRuntime.editorModel.dispose();
        editorRuntime.editorModel = null;
      }

      const language = languageForPath(file.relativePath);
      const safeRelativePath = file.relativePath.replace(/\\/g, "/");
      const uri = editorRuntime.monacoApi.Uri.parse(
        `inmemory://workspace/${safeRelativePath}`,
      );
      editorRuntime.editorModel = editorRuntime.monacoApi.editor.createModel(
        file.content,
        language,
        uri,
      );
      editorRuntime.monacoEditor.setModel(editorRuntime.editorModel);
      editorRuntime.monacoEditor.setScrollTop(0);

      if (Number.isInteger(lineNumber) && lineNumber > 0) {
        editorRuntime.monacoEditor.revealLineInCenter(lineNumber);
        editorRuntime.monacoEditor.setPosition({ lineNumber, column: 1 });
      }

      elements.fileEditorPath.textContent = file.relativePath;
      elements.fileDrawer.classList.remove("hidden");
      elements.fileEditorPanel.classList.remove("hidden");
      elements.fileEditorEmpty.classList.add("hidden");
      editorState.open = true;
      editorState.sessionId = sessionId;
      editorState.filePath = filePath;
      editorState.relativePath = file.relativePath;
      editorState.dirty = false;

      setEditorStatus(`Opened ${file.relativePath}`);
      editorRuntime.monacoEditor.focus();
    } catch (error) {
      const detail = error?.message || String(error || "Unknown error");
      const message = `Unable to open ${filePath} while ${openStage}: ${detail}`;
      console.error(message, {
        error,
        filePath,
        lineNumber,
        openStage,
        sessionId,
      });
      elements.fileEditorPath.textContent = filePath;
      elements.fileDrawer.classList.remove("hidden");
      elements.fileEditorPanel.classList.remove("hidden");
      elements.fileEditorEmpty.classList.add("hidden");
      setEditorStatus(message);
      setStatus("Error", message);
    } finally {
      editorRuntime.suppressEditorChange = false;
    }
  }

  function openFileDrawer() {
    elements.fileDrawer.classList.remove("hidden");
  }

  function closeFileEditorModal(force = false) {
    if (!editorState.open) {
      elements.fileEditorPanel.classList.add("hidden");
      elements.fileEditorEmpty.classList.remove("hidden");
      elements.fileDrawer.classList.add("hidden");
      return true;
    }

    if (editorState.dirty && !force) {
      const shouldDiscard = window.confirm(
        "Discard unsaved changes in the file editor?",
      );
      if (!shouldDiscard) {
        return false;
      }
    }

    elements.fileEditorPanel.classList.add("hidden");
    elements.fileEditorEmpty.classList.remove("hidden");
    elements.fileDrawer.classList.add("hidden");
    editorState.open = false;

    if (editorRuntime.autosaveTimeoutId) {
      window.clearTimeout(editorRuntime.autosaveTimeoutId);
      editorRuntime.autosaveTimeoutId = null;
    }

    const agent = getActiveTerminalInstance();
    agent?.terminal.focus();

    return true;
  }

  async function openWorkspaceSearch() {
    const root = getWorkspaceRootForSearch();
    if (!root) {
      setStatus("Error", "Open a session before searching files");
      return;
    }

    uiState.isWorkspaceSearchOpen = true;
    elements.workspaceSearchOverlay.classList.remove("hidden");
    workspaceSearchState.root = root;
    workspaceSearchState.files = [];
    workspaceSearchState.filtered = [];
    workspaceSearchState.activeIndex = 0;
    workspaceSearchState.loading = true;
    workspaceSearchState.query = elements.workspaceSearchInput.value || "";
    renderWorkspaceSearchResults();
    elements.workspaceSearchInput.focus();
    elements.workspaceSearchInput.select();

    try {
      const files = await loadWorkspaceFiles(root);
      if (
        !uiState.isWorkspaceSearchOpen ||
        workspaceSearchState.root !== root
      ) {
        return;
      }

      workspaceSearchState.files = files;
      workspaceSearchState.loading = false;
      applyWorkspaceSearchQuery(elements.workspaceSearchInput.value);
    } catch (error) {
      workspaceSearchState.loading = false;
      elements.workspaceSearchCount.textContent =
        error.message || "Unable to search files";
      elements.workspaceSearchResults.innerHTML =
        '<div class="workspace-search-empty">Unable to load workspace files.</div>';
    }
  }

  function closeWorkspaceSearch({ restoreFocus = true } = {}) {
    uiState.isWorkspaceSearchOpen = false;
    elements.workspaceSearchOverlay.classList.add("hidden");
    workspaceSearchState.activeIndex = 0;

    if (restoreFocus) {
      getActiveTerminalInstance()?.terminal.focus();
    }
  }

  async function openWorkspaceSearchResult() {
    const result = getActiveWorkspaceSearchResult();
    if (!result || !uiState.activeSessionId) {
      return;
    }

    closeWorkspaceSearch({ restoreFocus: false });
    await openReferencedFile(
      uiState.activeSessionId,
      result.absolutePath,
      null,
    );
  }

  function moveWorkspaceSearchSelection(direction) {
    if (!workspaceSearchState.filtered.length) {
      return;
    }

    const delta = direction === "up" ? -1 : 1;
    const length = workspaceSearchState.filtered.length;
    workspaceSearchState.activeIndex =
      (workspaceSearchState.activeIndex + delta + length) % length;
    renderWorkspaceSearchResults();
  }

  if (registerUiBindings) {
    elements.workspaceSearchInput.addEventListener("input", () => {
      applyWorkspaceSearchQuery(elements.workspaceSearchInput.value);
    });

    elements.workspaceSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        openWorkspaceSearchResult();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveWorkspaceSearchSelection("down");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveWorkspaceSearchSelection("up");
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeWorkspaceSearch();
      }
    });

    elements.workspaceSearchCloseButton.addEventListener("click", () => {
      closeWorkspaceSearch();
    });

    elements.workspaceSearchResults.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const resultButton = target.closest(".workspace-search-result");
      if (!resultButton?.dataset.filePath || !uiState.activeSessionId) {
        return;
      }

      closeWorkspaceSearch({ restoreFocus: false });
      await openReferencedFile(
        uiState.activeSessionId,
        resultButton.dataset.filePath,
        null,
      );
    });

    elements.fileEditorSaveButton.addEventListener("click", () => {
      saveOpenEditorFile("Saved");
    });

    elements.fileEditorCloseButton.addEventListener("click", () => {
      closeFileEditorModal();
    });

    elements.fileEditorAutosave.addEventListener("change", () => {
      editorState.autosave = elements.fileEditorAutosave.checked;
      window.localStorage.setItem(
        "agentic-command-editor-autosave",
        editorState.autosave ? "1" : "0",
      );

      if (!editorState.autosave && editorRuntime.autosaveTimeoutId) {
        window.clearTimeout(editorRuntime.autosaveTimeoutId);
        editorRuntime.autosaveTimeoutId = null;
      }
    });
  }

  if (initializeAutosave) {
    editorState.autosave =
      window.localStorage.getItem("agentic-command-editor-autosave") === "1";
    elements.fileEditorAutosave.checked = editorState.autosave;
  }

  return {
    applyWorkspaceSearchQuery,
    closeFileEditorModal,
    moveWorkspaceSearchSelection,
    openFileDrawer,
    openReferencedFile,
    openWorkspaceSearch,
    openWorkspaceSearchResult,
    closeWorkspaceSearch,
    saveOpenEditorFile,
  };
}
