export function createWorkspaceEditorLifecycle({
  elements,
  getActiveSessionId,
  applyWorkspaceSearchQuery,
  moveWorkspaceSearchSelection,
  openWorkspaceSearchResult,
  closeWorkspaceSearch,
  openReferencedFile,
  saveOpenEditorFile,
  closeFileEditorModal,
  setEditorAutosave,
  getEditorAutosave,
  onAutosaveDisabled,
}) {
  const AUTOSAVE_STORAGE_KEY = "agentic-command-editor-autosave";

  function initializeAutosaveState() {
    const enabled = window.localStorage.getItem(AUTOSAVE_STORAGE_KEY) === "1";
    setEditorAutosave(enabled);
    elements.fileEditorAutosave.checked = enabled;
  }

  function bindEvents() {
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
      if (!resultButton?.dataset.filePath || !getActiveSessionId()) {
        return;
      }

      closeWorkspaceSearch({ restoreFocus: false });
      await openReferencedFile(
        getActiveSessionId(),
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
      const enabled = elements.fileEditorAutosave.checked;
      setEditorAutosave(enabled);
      window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, enabled ? "1" : "0");

      if (!enabled) {
        onAutosaveDisabled();
      }
    });
  }

  return {
    bindEvents,
    initializeAutosaveState,
    getEditorAutosave,
  };
}
