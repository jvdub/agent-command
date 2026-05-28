export function createAgentSearchController({
  elements,
  getActiveTerminalInstance,
  setStatus,
  terminalSearchOptions,
}) {
  let terminalContextTarget = null;
  let isOpen = false;

  function setSearchMessage(message, isError = false) {
    elements.agentSearchCount.textContent = message;
    elements.agentSearchCount.classList.toggle("error", isError);
  }

  function getActiveAgentSearchAddon() {
    return getActiveTerminalInstance()?.searchAddon || null;
  }

  function updateAgentSearchControls() {
    const hasActiveTerminal = Boolean(getActiveTerminalInstance());
    const hasTerm = Boolean(elements.agentSearchInput.value.trim());

    elements.agentSearchInput.disabled = !hasActiveTerminal;
    elements.agentSearchPrevButton.disabled = !hasActiveTerminal || !hasTerm;
    elements.agentSearchNextButton.disabled = !hasActiveTerminal || !hasTerm;

    if (!hasActiveTerminal) {
      setSearchMessage("No active session", true);
      return;
    }

    if (!hasTerm) {
      setSearchMessage("Type to search");
    }
  }

  function clearAgentSearch() {
    const searchAddon = getActiveAgentSearchAddon();
    if (searchAddon) {
      searchAddon.clearDecorations();
    }

    elements.agentSearchInput.value = "";
    updateAgentSearchControls();
  }

  function closeAgentSearch({ restoreFocus = true, clear = true } = {}) {
    isOpen = false;
    elements.agentSearchBar.classList.add("hidden");

    if (clear) {
      clearAgentSearch();
    }

    if (restoreFocus) {
      getActiveTerminalInstance()?.terminal.focus();
    }
  }

  function openAgentSearch({ selectText = true } = {}) {
    if (!getActiveTerminalInstance()) {
      setStatus("Find", "Open a session before searching");
      return;
    }

    isOpen = true;
    elements.agentSearchBar.classList.remove("hidden");
    updateAgentSearchControls();

    if (selectText && elements.agentSearchInput.value) {
      elements.agentSearchInput.select();
      return;
    }

    elements.agentSearchInput.focus();
  }

  function runAgentSearch(direction = "next", options = {}) {
    const searchAddon = getActiveAgentSearchAddon();
    const term = elements.agentSearchInput.value.trim();

    if (!searchAddon) {
      updateAgentSearchControls();
      return false;
    }

    if (!term) {
      searchAddon.clearDecorations();
      updateAgentSearchControls();
      return false;
    }

    const searchOptions = {
      ...terminalSearchOptions,
      incremental: options.incremental === true,
    };

    const matched =
      direction === "previous"
        ? searchAddon.findPrevious(term, searchOptions)
        : searchAddon.findNext(term, searchOptions);

    if (!matched) {
      setSearchMessage("No matches", true);
    }

    updateAgentSearchControls();
    return matched;
  }

  function closeTerminalContextMenu() {
    elements.terminalContextMenu.classList.add("hidden");
    terminalContextTarget = null;
  }

  function openTerminalContextMenu(event, target) {
    event.preventDefault();
    terminalContextTarget = target;

    const selection = target.terminal.getSelection();
    elements.terminalContextCopyButton.disabled = !selection;

    const menuWidth = 152;
    const menuHeight = 132;
    const left = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
    const top = Math.min(event.clientY, window.innerHeight - menuHeight - 12);

    elements.terminalContextMenu.style.left = `${Math.max(12, left)}px`;
    elements.terminalContextMenu.style.top = `${Math.max(12, top)}px`;
    elements.terminalContextMenu.classList.remove("hidden");
  }

  function handleSearchResults({
    sessionId,
    activeSessionId,
    resultIndex,
    resultCount,
  }) {
    if (activeSessionId !== sessionId || !isOpen) {
      return;
    }

    if (!elements.agentSearchInput.value.trim()) {
      setSearchMessage("Type to search");
      return;
    }

    if (resultCount === 0) {
      setSearchMessage("No matches", true);
      return;
    }

    if (resultIndex >= 0) {
      setSearchMessage(`${resultIndex + 1} of ${resultCount}`);
      return;
    }

    setSearchMessage(`${resultCount} matches`);
  }

  return {
    closeAgentSearch,
    closeTerminalContextMenu,
    getActiveAgentSearchAddon,
    getTerminalContextTarget: () => terminalContextTarget,
    handleSearchResults,
    isOpen: () => isOpen,
    openAgentSearch,
    openTerminalContextMenu,
    runAgentSearch,
    updateAgentSearchControls,
  };
}
