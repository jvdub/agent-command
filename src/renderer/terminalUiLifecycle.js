export function createTerminalUiLifecycle({
  elements,
  getActiveAgentSearchAddon,
  updateAgentSearchControls,
  runAgentSearch,
  closeAgentSearch,
  closeTerminalContextMenu,
  getTerminalContextTarget,
  copyTerminalSelection,
  pasteIntoTerminal,
  sendTerminalClearCommand,
}) {
  function bindEvents() {
    elements.agentSearchInput.addEventListener("input", () => {
      const term = elements.agentSearchInput.value.trim();

      if (!term) {
        const searchAddon = getActiveAgentSearchAddon();
        if (searchAddon) {
          searchAddon.clearDecorations();
        }
        updateAgentSearchControls();
        return;
      }

      runAgentSearch("next", { incremental: true });
    });

    elements.agentSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runAgentSearch(event.shiftKey ? "previous" : "next");
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeAgentSearch();
      }
    });

    elements.agentSearchPrevButton.addEventListener("click", () => {
      runAgentSearch("previous");
    });

    elements.agentSearchNextButton.addEventListener("click", () => {
      runAgentSearch("next");
    });

    elements.agentSearchCloseButton.addEventListener("click", () => {
      closeAgentSearch();
    });

    elements.terminalContextCopyButton.addEventListener("click", async () => {
      const contextTarget = getTerminalContextTarget();
      if (contextTarget) {
        await copyTerminalSelection(contextTarget.terminal);
      }
      closeTerminalContextMenu();
    });

    elements.terminalContextPasteButton.addEventListener("click", async () => {
      const contextTarget = getTerminalContextTarget();
      if (contextTarget) {
        await pasteIntoTerminal(contextTarget.terminal);
      }
      closeTerminalContextMenu();
    });

    elements.terminalContextClearButton.addEventListener("click", async () => {
      const contextTarget = getTerminalContextTarget();
      if (contextTarget) {
        await sendTerminalClearCommand(contextTarget);
      }
      closeTerminalContextMenu();
    });
  }

  return {
    bindEvents,
  };
}
