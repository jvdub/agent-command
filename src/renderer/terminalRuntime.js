import { Terminal } from "./vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "./vendor/@xterm/addon-fit/lib/addon-fit.mjs";
import { SearchAddon } from "./vendor/@xterm/addon-search/lib/addon-search.mjs";
import { WebLinksAddon } from "./vendor/@xterm/addon-web-links/lib/addon-web-links.mjs";

import { agenticApp } from "./agenticApp.js";
import { TERMINAL_OPTIONS, TERMINAL_SEARCH_OPTIONS } from "./constants.js";
import { elements } from "./dom.js";
import {
  manualTerminalBuffers,
  manualTerminalKey,
  manualTerminals,
  sessionBuffers,
  sessionTerminals,
  uiState,
} from "./state.js";

function isClipboardShortcut(event, key) {
  const pressedKey = String(event.key || "").toLowerCase();
  return (
    (event.ctrlKey || event.metaKey) && !event.altKey && pressedKey === key
  );
}

async function copyTerminalSelection(terminal) {
  const selection = terminal.getSelection();
  if (!selection) {
    return false;
  }

  await agenticApp.writeClipboardText(selection);
  return true;
}

async function pasteIntoTerminal(terminal) {
  const text = await agenticApp.readClipboardText();
  if (!text) {
    return false;
  }

  terminal.paste(text);
  return true;
}

export function createTerminalManager({
  clearSessionFileReferences,
  markSessionInput,
  renderSessionFileReferences,
  scheduleUiRefresh,
  setStatus,
}) {
  function closeTerminalContextMenu() {
    elements.terminalContextMenu.classList.add("hidden");
    uiState.terminalContextTarget = null;
  }

  function setAgentSearchMessage(message, isError = false) {
    elements.agentSearchCount.textContent = message;
    elements.agentSearchCount.classList.toggle("error", isError);
  }

  function getActiveTerminalInstance() {
    if (!uiState.activeSessionId) {
      return null;
    }

    return sessionTerminals.get(uiState.activeSessionId) || null;
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
      setAgentSearchMessage("No active session", true);
      return;
    }

    if (!hasTerm) {
      setAgentSearchMessage("Type to search");
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
    uiState.isAgentSearchOpen = false;
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

    uiState.isAgentSearchOpen = true;
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
      ...TERMINAL_SEARCH_OPTIONS,
      incremental: options.incremental === true,
    };

    const matched =
      direction === "previous"
        ? searchAddon.findPrevious(term, searchOptions)
        : searchAddon.findNext(term, searchOptions);

    if (!matched) {
      setAgentSearchMessage("No matches", true);
    }

    updateAgentSearchControls();
    return matched;
  }

  function openTerminalContextMenu(event, target) {
    event.preventDefault();
    uiState.terminalContextTarget = target;

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

  function attachTerminalClipboardHandlers(target) {
    const { terminal, mount } = target;

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      if (isClipboardShortcut(event, "c") && terminal.hasSelection()) {
        event.preventDefault();
        copyTerminalSelection(terminal);
        return false;
      }

      if (isClipboardShortcut(event, "v")) {
        event.preventDefault();
        pasteIntoTerminal(terminal);
        return false;
      }

      return true;
    });

    mount.addEventListener("copy", (event) => {
      const selection = terminal.getSelection();
      if (!selection) {
        return;
      }

      event.preventDefault();
      agenticApp.writeClipboardText(selection);
    });

    mount.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text");
      if (!text) {
        return;
      }

      event.preventDefault();
      terminal.paste(text);
    });

    mount.addEventListener("contextmenu", (event) => {
      openTerminalContextMenu(event, target);
    });
  }

  async function sendTerminalClearCommand(target) {
    if (!target?.sessionId) {
      return;
    }

    if (target.kind === "manual") {
      await agenticApp.writeToManualTerminal(target.sessionId, "clear\r");
      return;
    }

    markSessionInput(target.sessionId);
    clearSessionFileReferences(target.sessionId);
    if (uiState.activeSessionId === target.sessionId) {
      renderSessionFileReferences(target.sessionId);
    }
    scheduleUiRefresh();
    await agenticApp.writeToSession(target.sessionId, "/clear\r");
  }

  function createWebLinksAddon(instance) {
    return new WebLinksAddon((event, uri) => {
      event?.preventDefault?.();

      Promise.resolve(agenticApp.openExternalUrl(uri))
        .then(() => {
          setStatus("Opened", uri);
        })
        .catch((error) => {
          const detail = error?.message || "Unable to open link";
          setStatus("Error", detail);
        });

      if (instance.kind === "agent") {
        markSessionInput(instance.sessionId);
        scheduleUiRefresh();
      }
    });
  }

  function createSessionTerminal(sessionId) {
    if (sessionTerminals.has(sessionId)) {
      return sessionTerminals.get(sessionId);
    }

    const mount = document.createElement("div");
    mount.className = "terminal-instance hidden";
    mount.dataset.sessionId = sessionId;
    elements.terminalContainer.append(mount);

    const terminal = new Terminal(TERMINAL_OPTIONS);
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon({ highlightLimit: 2000 });
    const webLinksAddon = createWebLinksAddon({
      sessionId,
      kind: "agent",
    });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(mount);

    const instance = {
      terminal,
      fitAddon,
      searchAddon,
      mount,
      sessionId,
      kind: "agent",
    };
    attachTerminalClipboardHandlers(instance);

    searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
      if (uiState.activeSessionId !== sessionId || !uiState.isAgentSearchOpen) {
        return;
      }

      if (!elements.agentSearchInput.value.trim()) {
        setAgentSearchMessage("Type to search");
        return;
      }

      if (resultCount === 0) {
        setAgentSearchMessage("No matches", true);
        return;
      }

      if (resultIndex >= 0) {
        setAgentSearchMessage(`${resultIndex + 1} of ${resultCount}`);
        return;
      }

      setAgentSearchMessage(`${resultCount} matches`);
    });

    terminal.onData((data) => {
      if (uiState.activeSessionId !== sessionId) {
        return;
      }

      markSessionInput(sessionId);
      scheduleUiRefresh();
      agenticApp.writeToSession(sessionId, data);
    });

    sessionTerminals.set(sessionId, instance);

    const buffer = sessionBuffers.get(sessionId);
    if (buffer) {
      terminal.write(buffer);
    }

    return instance;
  }

  function showSessionTerminal(sessionId) {
    for (const [id, instance] of sessionTerminals.entries()) {
      instance.mount.classList.toggle("hidden", id !== sessionId);
    }

    const instance = createSessionTerminal(sessionId);
    instance.mount.classList.remove("hidden");
    instance.fitAddon.fit();
    instance.terminal.focus();
    return instance;
  }

  function updateManualTerminalSubtitle(session, terminalId) {
    const target =
      terminalId === "2"
        ? elements.manualTerminalSubtitle2
        : elements.manualTerminalSubtitle1;
    if (!session) {
      target.textContent = "";
      return;
    }

    target.textContent = `${session.cwd} - Interactive shell`;
  }

  function getManualTerminalContainer(terminalId) {
    return terminalId === "2"
      ? elements.manualTerminalContainer2
      : elements.manualTerminalContainer1;
  }

  function createManualTerminal(sessionId, terminalId) {
    const key = manualTerminalKey(sessionId, terminalId);
    if (manualTerminals.has(key)) {
      return manualTerminals.get(key);
    }

    const container = getManualTerminalContainer(terminalId);
    const mount = document.createElement("div");
    mount.className = "terminal-instance hidden";
    mount.dataset.sessionId = sessionId;
    mount.dataset.terminalId = terminalId;
    container.append(mount);

    const terminal = new Terminal(TERMINAL_OPTIONS);
    const fitAddon = new FitAddon();
    const webLinksAddon = createWebLinksAddon({
      sessionId,
      kind: "manual",
    });
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(mount);

    const instance = {
      terminal,
      fitAddon,
      mount,
      sessionId,
      terminalId,
      kind: "manual",
      initialized: false,
    };
    attachTerminalClipboardHandlers(instance);

    terminal.onData((data) => {
      if (uiState.activeSessionId !== sessionId) {
        return;
      }

      agenticApp.writeToManualTerminal(sessionId, data, terminalId);
    });

    manualTerminals.set(key, instance);
    return instance;
  }

  async function ensureManualTerminal(sessionId, terminalId) {
    const key = manualTerminalKey(sessionId, terminalId);
    const instance = createManualTerminal(sessionId, terminalId);
    if (instance.initialized) {
      return instance;
    }

    const result = await agenticApp.ensureManualTerminal(sessionId, terminalId);
    const buffered =
      manualTerminalBuffers.get(key) || result.outputBuffer || "";

    if (buffered) {
      instance.terminal.write(buffered);
    }

    manualTerminalBuffers.set(key, buffered);
    instance.initialized = true;
    return instance;
  }

  async function showManualTerminal(sessionId, terminalId) {
    for (const instance of manualTerminals.values()) {
      const isVisible = instance.sessionId === sessionId;
      instance.mount.classList.toggle("hidden", !isVisible);
    }

    const instance = await ensureManualTerminal(sessionId, terminalId);
    instance.mount.classList.remove("hidden");
    instance.fitAddon.fit();
    return instance;
  }

  function getManualTerminalInstance(sessionId, terminalId) {
    if (!sessionId) {
      return null;
    }

    return (
      manualTerminals.get(manualTerminalKey(sessionId, terminalId)) || null
    );
  }

  async function resizeSession() {
    const instance = getActiveTerminalInstance();
    if (!uiState.activeSessionId || !instance) {
      return;
    }

    instance.fitAddon.fit();
    await agenticApp.resizeSession(uiState.activeSessionId, {
      cols: instance.terminal.cols,
      rows: instance.terminal.rows,
    });
  }

  async function resizeManualTerminal(terminalId) {
    const instance = getManualTerminalInstance(
      uiState.activeSessionId,
      terminalId,
    );
    if (!uiState.activeSessionId || !instance) {
      return;
    }

    instance.fitAddon.fit();
    await agenticApp.resizeManualTerminal(
      uiState.activeSessionId,
      {
        cols: instance.terminal.cols,
        rows: instance.terminal.rows,
      },
      terminalId,
    );
  }

  async function resizeManualTerminals() {
    await Promise.all([resizeManualTerminal("1"), resizeManualTerminal("2")]);
  }

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
    if (uiState.terminalContextTarget) {
      await copyTerminalSelection(uiState.terminalContextTarget.terminal);
    }
    closeTerminalContextMenu();
  });

  elements.terminalContextPasteButton.addEventListener("click", async () => {
    if (uiState.terminalContextTarget) {
      await pasteIntoTerminal(uiState.terminalContextTarget.terminal);
    }
    closeTerminalContextMenu();
  });

  elements.terminalContextClearButton.addEventListener("click", async () => {
    if (uiState.terminalContextTarget) {
      await sendTerminalClearCommand(uiState.terminalContextTarget);
    }
    closeTerminalContextMenu();
  });

  return {
    closeAgentSearch,
    closeTerminalContextMenu,
    createSessionTerminal,
    getActiveTerminalInstance,
    resizeManualTerminals,
    resizeSession,
    showManualTerminal,
    showSessionTerminal,
    openAgentSearch,
    updateManualTerminalSubtitle,
  };
}
