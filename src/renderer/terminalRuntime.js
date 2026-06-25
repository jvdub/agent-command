import { Terminal } from "./vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "./vendor/@xterm/addon-fit/lib/addon-fit.mjs";
import { SearchAddon } from "./vendor/@xterm/addon-search/lib/addon-search.mjs";
import { WebLinksAddon } from "./vendor/@xterm/addon-web-links/lib/addon-web-links.mjs";

import { agenticApp } from "./agenticApp.js";
import {
  FILE_REFERENCE_PATTERN,
  TERMINAL_OPTIONS,
  TERMINAL_SEARCH_OPTIONS,
} from "./constants.js";
import { elements } from "./dom.js";
import {
  manualTerminalBuffers,
  manualTerminals,
  sessionBuffers,
  sessionTerminals,
  uiState,
} from "./state.js";
import {
  SHORTCUT_ACTIONS,
  shouldRunShortcut,
} from "./shortcuts.js";
import { createTerminalClipboardController } from "./terminalClipboard.js";
import { normalizeCandidateFilePath } from "./utils.js";

function createManagerSearchUi({ getActiveTerminalInstance, setStatus }) {
  function setAgentSearchMessage(message, isError = false) {
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

  function handleSearchResults({ sessionId, resultIndex, resultCount }) {
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
  }

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
  }

  return {
    bindEvents,
    closeAgentSearch,
    handleSearchResults,
    openAgentSearch,
  };
}

export function createTerminalManager({
  markSessionInput,
  openReferencedFile,
  openWorkspaceSearch,
  scheduleUiRefresh,
  setStatus,
}) {
  let runtime = null;

  function isLikelyFileReference(rawValue) {
    const cleaned = normalizeCandidateFilePath(rawValue);
    if (!cleaned) {
      return false;
    }

    if (cleaned.includes("://")) {
      return false;
    }

    const normalized = cleaned.replace(/\\+/g, "/");
    if (normalized.includes("/")) {
      return true;
    }

    if (normalized.startsWith(".")) {
      return /[A-Za-z]/.test(normalized.slice(1));
    }

    const dotIndex = normalized.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
      return false;
    }

    const base = normalized.slice(0, dotIndex);
    const ext = normalized.slice(dotIndex + 1);
    if (!/[A-Za-z]/.test(base)) {
      return false;
    }

    return /^[A-Za-z][A-Za-z0-9_-]{1,15}$/.test(ext);
  }

  function closeTerminalContextMenu() {
    elements.terminalContextMenu.classList.add("hidden");
    uiState.terminalContextTarget = null;
  }

  function getActiveTerminalInstance() {
    if (!runtime) {
      return null;
    }

    return runtime.getActiveTerminalInstance();
  }

  const managerSearchUi = createManagerSearchUi({
    getActiveTerminalInstance,
    setStatus,
  });

  function triggerWorkspaceSearch() {
    if (typeof openWorkspaceSearch === "function") {
      openWorkspaceSearch();
      return;
    }

    window.dispatchEvent(new CustomEvent("agentic:quick-open"));
  }

  function openTerminalContextMenu(event, target) {
    event.preventDefault();
    uiState.terminalContextTarget = target;

    // Keep copy enabled even if xterm selection detection briefly desyncs on
    // right-click; the click handler can still use the preserved snapshot.
    elements.terminalContextCopyButton.disabled = !target;

    const menuWidth = 152;
    const menuHeight = 132;
    const left = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
    const top = Math.min(event.clientY, window.innerHeight - menuHeight - 12);

    elements.terminalContextMenu.style.left = `${Math.max(12, left)}px`;
    elements.terminalContextMenu.style.top = `${Math.max(12, top)}px`;
    elements.terminalContextMenu.classList.remove("hidden");
  }

  function createFileLinkProvider(sessionId, terminal) {
    return {
      provideLinks(y, callback) {
        const line = terminal.buffer.active.getLine(y - 1);
        if (!line) {
          callback(undefined);
          return;
        }

        const text = line.translateToString(true);
        const matcher = new RegExp(FILE_REFERENCE_PATTERN.source, "g");
        const links = [];
        let match;

        while ((match = matcher.exec(text)) !== null) {
          const rawPath = normalizeCandidateFilePath(match[1]);
          if (!rawPath || !isLikelyFileReference(rawPath)) {
            continue;
          }

          const lineNumber =
            match[2] || match[3] ? Number(match[2] || match[3]) : null;
          const startColumn = match.index + 1;
          const endColumn = match.index + match[0].length;
          if (endColumn < startColumn) {
            continue;
          }

          links.push({
            text: match[0],
            range: {
              start: { x: startColumn, y },
              end: { x: endColumn, y },
            },
            activate: () => openReferencedFile(sessionId, rawPath, lineNumber),
            hover: () => setStatus("Open File", rawPath),
          });
        }

        callback(links.length ? links : undefined);
      },
    };
  }

  runtime = createAppTerminalRuntime({
    agenticAppApi: agenticApp,
    sessionTerminalsById: sessionTerminals,
    manualTerminalsByKey: manualTerminals,
    manualTerminalBuffersByKey: manualTerminalBuffers,
    sessionBuffersById: sessionBuffers,
    getActiveSessionId: () => uiState.activeSessionId,
    markSessionInput,
    scheduleUiRefresh,
    setStatus,
    openWorkspaceSearch: triggerWorkspaceSearch,
    openTerminalContextMenu,
    handleSearchResults: managerSearchUi.handleSearchResults,
    terminalContainer: elements.terminalContainer,
    manualTerminalContainer1: elements.manualTerminalContainer1,
    manualTerminalContainer2: elements.manualTerminalContainer2,
    manualTerminalSubtitle1: elements.manualTerminalSubtitle1,
    manualTerminalSubtitle2: elements.manualTerminalSubtitle2,
    onSessionTerminalCreated: ({ sessionId, terminal }) => {
      terminal.registerLinkProvider(
        createFileLinkProvider(sessionId, terminal),
      );
    },
    onManualTerminalCreated: ({ sessionId, terminal }) => {
      terminal.registerLinkProvider(
        createFileLinkProvider(sessionId, terminal),
      );
    },
  });

  managerSearchUi.bindEvents();

  elements.terminalContextCopyButton.addEventListener("click", async () => {
    if (uiState.terminalContextTarget) {
      await runtime.copyTerminalSelection(uiState.terminalContextTarget);
    }
    closeTerminalContextMenu();
  });

  elements.terminalContextPasteButton.addEventListener("click", async () => {
    if (uiState.terminalContextTarget) {
      await runtime.pasteIntoTerminal(uiState.terminalContextTarget.terminal);
    }
    closeTerminalContextMenu();
  });

  elements.terminalContextClearButton.addEventListener("click", async () => {
    if (uiState.terminalContextTarget) {
      await runtime.sendTerminalClearCommand(uiState.terminalContextTarget);
    }
    closeTerminalContextMenu();
  });

  return {
    closeAgentSearch: managerSearchUi.closeAgentSearch,
    closeTerminalContextMenu,
    createSessionTerminal: runtime.createSessionTerminal,
    getActiveTerminalInstance,
    resizeManualTerminals: runtime.resizeManualTerminals,
    resizeSession: runtime.resizeSession,
    showManualTerminal: runtime.showManualTerminal,
    showSessionTerminal: runtime.showSessionTerminal,
    openAgentSearch: managerSearchUi.openAgentSearch,
    updateManualTerminalSubtitle: runtime.updateManualTerminalSubtitle,
  };
}

export function createAppTerminalRuntime({
  agenticAppApi,
  sessionTerminalsById,
  manualTerminalsByKey,
  manualTerminalBuffersByKey,
  sessionBuffersById,
  getActiveSessionId,
  markSessionInput,
  scheduleUiRefresh,
  setStatus,
  openWorkspaceSearch,
  openTerminalContextMenu,
  handleSearchResults,
  terminalContainer,
  manualTerminalContainer1,
  manualTerminalContainer2,
  manualTerminalSubtitle1,
  manualTerminalSubtitle2,
  onSessionTerminalCreated,
  onManualTerminalCreated,
}) {
  function runtimeManualTerminalKey(sessionId, terminalId) {
    return `${sessionId}:${terminalId}`;
  }

  const terminalClipboard = createTerminalClipboardController({
    readClipboardText: () => agenticAppApi.readClipboardText(),
    writeClipboardText: (value) => agenticAppApi.writeClipboardText(value),
    setStatus,
    openContextMenu: openTerminalContextMenu,
    sendInterrupt: (target) => {
      if (target.kind === "manual") {
        return agenticAppApi.writeToManualTerminal(
          target.sessionId,
          "\u0003",
          target.terminalId || "1",
        );
      }

      markSessionInput(target.sessionId);
      scheduleUiRefresh();
      return agenticAppApi.writeToSession(target.sessionId, "\u0003");
    },
  });

  function attachTerminalClipboardHandlers(target) {
    terminalClipboard.attachToTarget(target, {
      onKeyDown(event) {
        if (shouldRunShortcut(SHORTCUT_ACTIONS.QUICK_OPEN, event)) {
          event.preventDefault();
          openWorkspaceSearch();
          return false;
        }

        return true;
      },
    });
  }

  function createWebLinksAddon(instance) {
    return new WebLinksAddon((event, uri) => {
      event?.preventDefault?.();

      Promise.resolve(agenticAppApi.openExternalUrl(uri))
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
    if (sessionTerminalsById.has(sessionId)) {
      return sessionTerminalsById.get(sessionId);
    }

    const mount = document.createElement("div");
    mount.className = "terminal-instance hidden";
    mount.dataset.sessionId = sessionId;
    terminalContainer.append(mount);

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

    if (typeof onSessionTerminalCreated === "function") {
      onSessionTerminalCreated({ sessionId, terminal, instance });
    }

    attachTerminalClipboardHandlers(instance);

    searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
      handleSearchResults({ sessionId, resultIndex, resultCount });
    });

    terminal.onData((data) => {
      if (getActiveSessionId() !== sessionId) {
        return;
      }

      markSessionInput(sessionId);
      scheduleUiRefresh();
      agenticAppApi.writeToSession(sessionId, data);
    });

    sessionTerminalsById.set(sessionId, instance);

    const buffer = sessionBuffersById.get(sessionId);
    if (buffer) {
      terminal.write(buffer);
    }

    return instance;
  }

  function showSessionTerminal(sessionId) {
    for (const [id, instance] of sessionTerminalsById.entries()) {
      instance.mount.classList.toggle("hidden", id !== sessionId);
    }

    const instance = createSessionTerminal(sessionId);
    instance.mount.classList.remove("hidden");
    instance.fitAddon.fit();
    instance.terminal.focus();
    return instance;
  }

  function getActiveTerminalInstance() {
    const activeSessionId = getActiveSessionId();
    if (!activeSessionId) {
      return null;
    }

    return sessionTerminalsById.get(activeSessionId) || null;
  }

  function updateManualTerminalSubtitle(session, terminalId) {
    const target =
      terminalId === "2" ? manualTerminalSubtitle2 : manualTerminalSubtitle1;
    if (!session) {
      target.textContent = "";
      return;
    }

    target.textContent = `${session.cwd} - Interactive shell`;
  }

  function getManualTerminalContainer(terminalId) {
    return terminalId === "2"
      ? manualTerminalContainer2
      : manualTerminalContainer1;
  }

  function createManualTerminal(sessionId, terminalId) {
    const key = runtimeManualTerminalKey(sessionId, terminalId);
    if (manualTerminalsByKey.has(key)) {
      return manualTerminalsByKey.get(key);
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

    if (typeof onManualTerminalCreated === "function") {
      onManualTerminalCreated({ sessionId, terminalId, terminal, instance });
    }

    attachTerminalClipboardHandlers(instance);

    terminal.onData((data) => {
      if (getActiveSessionId() !== sessionId) {
        return;
      }

      agenticAppApi.writeToManualTerminal(sessionId, data, terminalId);
    });

    manualTerminalsByKey.set(key, instance);
    return instance;
  }

  async function ensureManualTerminal(sessionId, terminalId) {
    const key = runtimeManualTerminalKey(sessionId, terminalId);
    const instance = createManualTerminal(sessionId, terminalId);
    if (instance.initialized) {
      return instance;
    }

    const result = await agenticAppApi.ensureManualTerminal(
      sessionId,
      terminalId,
    );
    const buffered =
      manualTerminalBuffersByKey.get(key) || result.outputBuffer || "";

    if (buffered) {
      instance.terminal.write(buffered);
    }

    manualTerminalBuffersByKey.set(key, buffered);
    instance.initialized = true;
    return instance;
  }

  async function showManualTerminal(sessionId, terminalId) {
    for (const instance of manualTerminalsByKey.values()) {
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
      manualTerminalsByKey.get(
        runtimeManualTerminalKey(sessionId, terminalId),
      ) || null
    );
  }

  async function resizeSession() {
    const activeSessionId = getActiveSessionId();
    const instance = getActiveTerminalInstance();
    if (!activeSessionId || !instance) {
      return;
    }

    instance.fitAddon.fit();
    await agenticAppApi.resizeSession(activeSessionId, {
      cols: instance.terminal.cols,
      rows: instance.terminal.rows,
    });
  }

  async function resizeManualTerminal(terminalId) {
    const activeSessionId = getActiveSessionId();
    const instance = getManualTerminalInstance(activeSessionId, terminalId);
    if (!activeSessionId || !instance) {
      return;
    }

    instance.fitAddon.fit();
    await agenticAppApi.resizeManualTerminal(
      activeSessionId,
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

  async function sendTerminalClearCommand(target) {
    if (!target?.sessionId) {
      return;
    }

    if (target.kind === "manual") {
      await agenticAppApi.writeToManualTerminal(target.sessionId, "clear\r");
      return;
    }

    markSessionInput(target.sessionId);
    scheduleUiRefresh();
    await agenticAppApi.writeToSession(target.sessionId, "/clear\r");
  }

  return {
    copyTerminalSelection: terminalClipboard.copyTargetSelection,
    createSessionTerminal,
    getActiveTerminalInstance,
    pasteIntoTerminal: terminalClipboard.pasteIntoTerminal,
    resizeManualTerminals,
    resizeSession,
    sendTerminalClearCommand,
    showManualTerminal,
    showSessionTerminal,
    updateManualTerminalSubtitle,
  };
}
