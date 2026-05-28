import { createWorkspaceEditorLifecycle } from "../workspaceEditorLifecycle";

describe("workspaceEditorLifecycle integration", () => {
  function createElements() {
    return {
      workspaceSearchInput: document.createElement("input"),
      workspaceSearchCloseButton: document.createElement("button"),
      workspaceSearchResults: document.createElement("div"),
      fileEditorSaveButton: document.createElement("button"),
      fileEditorCloseButton: document.createElement("button"),
      fileEditorAutosave: document.createElement("input"),
    };
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  test("binds workspace search and file editor UI workflows", async () => {
    const elements = createElements();
    const applyWorkspaceSearchQuery = jest.fn();
    const moveWorkspaceSearchSelection = jest.fn();
    const openWorkspaceSearchResult = jest.fn();
    const closeWorkspaceSearch = jest.fn();
    const openReferencedFile = jest.fn(async () => {});
    const saveOpenEditorFile = jest.fn();
    const closeFileEditorModal = jest.fn();
    const setEditorAutosave = jest.fn();
    const onAutosaveDisabled = jest.fn();

    let activeSessionId = "session-1";

    const lifecycle = createWorkspaceEditorLifecycle({
      elements,
      getActiveSessionId: () => activeSessionId,
      applyWorkspaceSearchQuery,
      moveWorkspaceSearchSelection,
      openWorkspaceSearchResult,
      closeWorkspaceSearch,
      openReferencedFile,
      saveOpenEditorFile,
      closeFileEditorModal,
      setEditorAutosave,
      getEditorAutosave: () => false,
      onAutosaveDisabled,
    });

    lifecycle.bindEvents();

    elements.workspaceSearchInput.value = "main";
    elements.workspaceSearchInput.dispatchEvent(new Event("input"));
    expect(applyWorkspaceSearchQuery).toHaveBeenCalledWith("main");

    elements.workspaceSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(moveWorkspaceSearchSelection).toHaveBeenCalledWith("down");

    elements.workspaceSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(moveWorkspaceSearchSelection).toHaveBeenCalledWith("up");

    elements.workspaceSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(openWorkspaceSearchResult).toHaveBeenCalled();

    elements.workspaceSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(closeWorkspaceSearch).toHaveBeenCalled();

    elements.workspaceSearchCloseButton.click();
    expect(closeWorkspaceSearch).toHaveBeenCalledTimes(2);

    const resultButton = document.createElement("button");
    resultButton.className = "workspace-search-result";
    resultButton.dataset.filePath = "/repo/src/main.js";
    elements.workspaceSearchResults.appendChild(resultButton);
    resultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();

    expect(closeWorkspaceSearch).toHaveBeenCalledWith({ restoreFocus: false });
    expect(openReferencedFile).toHaveBeenCalledWith(
      "session-1",
      "/repo/src/main.js",
      null,
    );

    activeSessionId = null;
    resultButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(openReferencedFile).toHaveBeenCalledTimes(1);

    elements.fileEditorSaveButton.click();
    expect(saveOpenEditorFile).toHaveBeenCalledWith("Saved");

    elements.fileEditorCloseButton.click();
    expect(closeFileEditorModal).toHaveBeenCalled();

    elements.fileEditorAutosave.checked = false;
    elements.fileEditorAutosave.dispatchEvent(new Event("change"));
    expect(setEditorAutosave).toHaveBeenCalledWith(false);
    expect(window.localStorage.getItem("agentic-command-editor-autosave")).toBe(
      "0",
    );
    expect(onAutosaveDisabled).toHaveBeenCalled();
  });

  test("initializes autosave state from localStorage", () => {
    const elements = createElements();
    const setEditorAutosave = jest.fn();
    window.localStorage.setItem("agentic-command-editor-autosave", "1");

    const lifecycle = createWorkspaceEditorLifecycle({
      elements,
      getActiveSessionId: () => "session-1",
      applyWorkspaceSearchQuery: jest.fn(),
      moveWorkspaceSearchSelection: jest.fn(),
      openWorkspaceSearchResult: jest.fn(),
      closeWorkspaceSearch: jest.fn(),
      openReferencedFile: jest.fn(),
      saveOpenEditorFile: jest.fn(),
      closeFileEditorModal: jest.fn(),
      setEditorAutosave,
      getEditorAutosave: () => false,
      onAutosaveDisabled: jest.fn(),
    });

    lifecycle.initializeAutosaveState();

    expect(setEditorAutosave).toHaveBeenCalledWith(true);
    expect(elements.fileEditorAutosave.checked).toBe(true);
  });
});
