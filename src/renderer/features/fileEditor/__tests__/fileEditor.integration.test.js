import { createDefaultState } from "../../../state/index";
import { createCommandDispatcher } from "../../../commandDispatcher";
import { createFileEditor } from "../index";
import { agenticApp } from "../../../agenticApp";

jest.mock("../../../agenticApp", () => ({
  agenticApp: {
    openWorkspaceFile: jest.fn(),
  },
}));

describe("fileEditor integration", () => {
  let stateManager;
  let dispatcher;
  let elements;
  let setStatus;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});

    ({ stateManager } = createDefaultState());
    dispatcher = createCommandDispatcher();
    setStatus = jest.fn();

    elements = {
      fileEditorStatus: document.createElement("div"),
      fileEditorPath: document.createElement("div"),
      fileDrawer: document.createElement("div"),
      fileEditorPanel: document.createElement("div"),
      fileEditorEmpty: document.createElement("div"),
    };

    elements.fileDrawer.classList.add("hidden");
    elements.fileEditorPanel.classList.add("hidden");
    elements.fileEditorEmpty.classList.remove("hidden");
  });

  it("updates fileEditor state and UI when opening a referenced file", async () => {
    agenticApp.openWorkspaceFile.mockResolvedValue({
      relativePath: "src/main.js",
      content: 'console.log("ok")',
    });

    const fileEditor = createFileEditor({
      dispatcher,
      stateManager,
      elements,
      getActiveTerminalInstance: () => null,
      setStatus,
    });

    await fileEditor.openReferencedFile("session-1", "src/main.js", 12);

    const editorState = stateManager.getState(
      "features.fileEditor.editorState",
    );
    expect(editorState.open).toBe(true);
    expect(editorState.sessionId).toBe("session-1");
    expect(editorState.filePath).toBe("src/main.js");
    expect(editorState.relativePath).toBe("src/main.js");
    expect(editorState.dirty).toBe(false);

    expect(elements.fileEditorPath.textContent).toBe("src/main.js");
    expect(elements.fileDrawer.classList.contains("hidden")).toBe(false);
    expect(elements.fileEditorPanel.classList.contains("hidden")).toBe(false);
    expect(elements.fileEditorEmpty.classList.contains("hidden")).toBe(true);
    expect(elements.fileEditorStatus.textContent).toBe("Opened src/main.js");
    expect(setStatus).toHaveBeenCalledWith("Opened", "src/main.js");
  });

  it("handles fileReferenceClicked through dispatcher wiring", async () => {
    agenticApp.openWorkspaceFile.mockResolvedValue({
      relativePath: "README.md",
      content: "# readme",
    });

    const fileEditor = createFileEditor({
      dispatcher,
      stateManager,
      elements,
      getActiveTerminalInstance: () => null,
      setStatus,
    });

    fileEditor.setupDispatcherListeners(dispatcher);

    dispatcher.emit("fileReferenceClicked", {
      sessionId: "session-2",
      filePath: "README.md",
      lineNumber: 3,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(agenticApp.openWorkspaceFile).toHaveBeenCalledWith(
      "session-2",
      "README.md",
    );
    const editorState = stateManager.getState(
      "features.fileEditor.editorState",
    );
    expect(editorState.sessionId).toBe("session-2");
    expect(editorState.relativePath).toBe("README.md");
  });

  it("sets error status when openReferencedFile fails", async () => {
    agenticApp.openWorkspaceFile.mockRejectedValue(new Error("boom"));

    const fileEditor = createFileEditor({
      dispatcher,
      stateManager,
      elements,
      getActiveTerminalInstance: () => null,
      setStatus,
    });

    await expect(
      fileEditor.openReferencedFile("session-err", "bad/path.txt"),
    ).rejects.toThrow("boom");

    const message =
      "Unable to open bad/path.txt while reading the workspace file: boom";
    expect(elements.fileEditorStatus.textContent).toBe(message);
    expect(setStatus).toHaveBeenCalledWith("Error", message);
    expect(console.error).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        filePath: "bad/path.txt",
        sessionId: "session-err",
      }),
    );
  });
});
