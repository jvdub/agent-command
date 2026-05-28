import { createAgentSearchController } from "../agentSearchController";

describe("agentSearchController integration", () => {
  function createElements() {
    return {
      agentSearchBar: document.createElement("div"),
      agentSearchInput: document.createElement("input"),
      agentSearchCount: document.createElement("div"),
      agentSearchPrevButton: document.createElement("button"),
      agentSearchNextButton: document.createElement("button"),
      terminalContextMenu: document.createElement("div"),
      terminalContextCopyButton: document.createElement("button"),
    };
  }

  test("manages open/close state, search controls, and context target", () => {
    const elements = createElements();
    elements.agentSearchBar.classList.add("hidden");
    elements.terminalContextMenu.classList.add("hidden");

    const findNext = jest.fn(() => true);
    const findPrevious = jest.fn(() => false);
    const searchAddon = {
      clearDecorations: jest.fn(),
      findNext,
      findPrevious,
    };

    const activeTerminal = { terminal: { focus: jest.fn() }, searchAddon };
    const controller = createAgentSearchController({
      elements,
      getActiveTerminalInstance: () => activeTerminal,
      setStatus: jest.fn(),
      terminalSearchOptions: { caseSensitive: false },
    });

    controller.updateAgentSearchControls();
    expect(elements.agentSearchInput.disabled).toBe(false);
    expect(elements.agentSearchCount.textContent).toBe("Type to search");

    controller.openAgentSearch();
    expect(controller.isOpen()).toBe(true);
    expect(elements.agentSearchBar.classList.contains("hidden")).toBe(false);

    elements.agentSearchInput.value = "needle";
    expect(controller.runAgentSearch("next", { incremental: true })).toBe(true);
    expect(findNext).toHaveBeenCalledWith("needle", {
      caseSensitive: false,
      incremental: true,
    });

    expect(controller.runAgentSearch("previous")).toBe(false);
    expect(findPrevious).toHaveBeenCalledWith("needle", {
      caseSensitive: false,
      incremental: false,
    });
    expect(elements.agentSearchCount.textContent).toBe("No matches");

    controller.handleSearchResults({
      sessionId: "s1",
      activeSessionId: "s1",
      resultIndex: 1,
      resultCount: 3,
    });
    expect(elements.agentSearchCount.textContent).toBe("2 of 3");

    const target = { terminal: { getSelection: () => "x" } };
    controller.openTerminalContextMenu(
      { preventDefault: jest.fn(), clientX: 10, clientY: 10 },
      target,
    );
    expect(controller.getTerminalContextTarget()).toBe(target);
    expect(elements.terminalContextMenu.classList.contains("hidden")).toBe(
      false,
    );

    controller.closeTerminalContextMenu();
    expect(controller.getTerminalContextTarget()).toBeNull();

    controller.closeAgentSearch();
    expect(controller.isOpen()).toBe(false);
    expect(elements.agentSearchBar.classList.contains("hidden")).toBe(true);
  });
});
