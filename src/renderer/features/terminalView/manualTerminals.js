/**
 * Manual Terminals Feature
 *
 * Manages manual (interactive shell) terminal instances.
 * Owns state under stateManager.features.terminalView.manualTerminals
 */

import { Terminal } from "../../vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "../../vendor/@xterm/addon-fit/lib/addon-fit.mjs";
import { WebLinksAddon } from "../../vendor/@xterm/addon-web-links/lib/addon-web-links.mjs";

import { agenticApp } from "../../agenticApp.js";
import { TERMINAL_OPTIONS } from "../../constants.js";

/**
 * Creates the manual terminals feature
 * @param {Object} config
 * @param {CommandDispatcher} config.dispatcher
 * @param {StateManager} config.stateManager
 * @param {Object} config.elements - DOM element references
 * @param {Object} config.appState - Legacy app state (manualTerminals, manualTerminalBuffers, manualTerminalKey, uiState)
 * @param {Function} config.scheduleUiRefresh
 * @param {Function} config.setStatus
 * @returns {Object} Public API for manual terminals
 */
export function createManualTerminals(config) {
  const {
    dispatcher,
    stateManager,
    elements,
    scheduleUiRefresh,
    setStatus,
    createWebLinksAddon,
    attachTerminalClipboardHandlers,
  } = config;

  // Helper: Get container for specific terminal ID
  function getManualTerminalContainer(terminalId) {
    return terminalId === "2"
      ? elements.manualTerminalContainer2
      : elements.manualTerminalContainer1;
  }

  // Public API: Update subtitle for manual terminal
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

  // Public API: Create manual terminal instance
  function createManualTerminal(sessionId, terminalId) {
    const key = `${sessionId}:${terminalId}`;
    const manualTerminals =
      stateManager.getState("features.terminalView.manualTerminals") ||
      new Map();

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

    fitAddon.fit();

    manualTerminals.set(key, terminal);
    stateManager.setState(
      "features.terminalView.manualTerminals",
      manualTerminals,
    );

    return terminal;
  }

  // Public API: Ensure manual terminal is initialized
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

  // Public API: Show manual terminal
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

  // Public API: Get manual terminal instance
  function getManualTerminalInstance(sessionId, terminalId) {
    if (!sessionId) {
      return null;
    }

    return (
      manualTerminals.get(manualTerminalKey(sessionId, terminalId)) || null
    );
  }

  // Public API: Resize individual manual terminal
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

  // Public API: Resize all manual terminals
  async function resizeManualTerminals() {
    await Promise.all([resizeManualTerminal("1"), resizeManualTerminal("2")]);
  }

  // Return public API
  return {
    createManualTerminal,
    ensureManualTerminal,
    showManualTerminal,
    getManualTerminalInstance,
    getManualTerminalContainer,
    updateManualTerminalSubtitle,
    resizeManualTerminal,
    resizeManualTerminals,
  };
}
