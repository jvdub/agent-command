import { createTerminalUiLifecycle } from "../terminalUiLifecycle";

describe("terminalUiLifecycle integration", () => {
  function createElements() {
    return {
      agentSearchInput: document.createElement("input"),
      agentSearchPrevButton: document.createElement("button"),
      agentSearchNextButton: document.createElement("button"),
      agentSearchCloseButton: document.createElement("button"),
      terminalContextCopyButton: document.createElement("button"),
      terminalContextPasteButton: document.createElement("button"),
      terminalContextClearButton: document.createElement("button"),
    };
  }

  test("binds agent search and terminal context menu events", async () => {
    const elements = createElements();
    const clearDecorations = jest.fn();
    const getActiveAgentSearchAddon = jest.fn(() => ({ clearDecorations }));
    const updateAgentSearchControls = jest.fn();
    const runAgentSearch = jest.fn();
    const closeAgentSearch = jest.fn();
    const closeTerminalContextMenu = jest.fn();

    const contextTarget = {
      terminal: { id: "term-1" },
      sessionId: "session-1",
      kind: "agent",
    };

    let currentContextTarget = contextTarget;

    const lifecycle = createTerminalUiLifecycle({
      elements,
      getActiveAgentSearchAddon,
      updateAgentSearchControls,
      runAgentSearch,
      closeAgentSearch,
      closeTerminalContextMenu,
      getTerminalContextTarget: () => currentContextTarget,
      copyTerminalSelection: jest.fn(async () => true),
      pasteIntoTerminal: jest.fn(async () => true),
      sendTerminalClearCommand: jest.fn(async () => true),
    });

    lifecycle.bindEvents();

    elements.agentSearchInput.value = "";
    elements.agentSearchInput.dispatchEvent(new Event("input"));
    expect(clearDecorations).toHaveBeenCalled();
    expect(updateAgentSearchControls).toHaveBeenCalled();

    elements.agentSearchInput.value = "foo";
    elements.agentSearchInput.dispatchEvent(new Event("input"));
    expect(runAgentSearch).toHaveBeenCalledWith("next", { incremental: true });

    elements.agentSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(runAgentSearch).toHaveBeenCalledWith("next");

    elements.agentSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(runAgentSearch).toHaveBeenCalledWith("previous");

    elements.agentSearchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(closeAgentSearch).toHaveBeenCalled();

    elements.agentSearchPrevButton.click();
    expect(runAgentSearch).toHaveBeenCalledWith("previous");
    elements.agentSearchNextButton.click();
    expect(runAgentSearch).toHaveBeenCalledWith("next");
    elements.agentSearchCloseButton.click();
    expect(closeAgentSearch).toHaveBeenCalled();

    elements.terminalContextCopyButton.click();
    elements.terminalContextPasteButton.click();
    elements.terminalContextClearButton.click();

    await Promise.resolve();

    expect(closeTerminalContextMenu).toHaveBeenCalledTimes(3);

    currentContextTarget = null;
    elements.terminalContextCopyButton.click();
    await Promise.resolve();

    expect(closeTerminalContextMenu).toHaveBeenCalledTimes(4);
  });
});
