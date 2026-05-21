/**
 * Terminal View Feature - Composition
 *
 * Composes agent terminal and manual terminals into a unified terminal management interface.
 * Initializes feature state in stateManager and wires dispatcher commands.
 */

import { createAgentTerminal } from "./agentTerminal.js";
import { createManualTerminals } from "./manualTerminals.js";

/**
 * Creates the terminal view feature
 * @param {Object} config
 * @param {CommandDispatcher} config.dispatcher
 * @param {StateManager} config.stateManager
 * @param {Object} config.elements - DOM element references
 * @param {Object} config.appState - App state (sessions, sessionTerminals, sessionBuffers, etc.)
 * @param {Function} config.markSessionInput
 * @param {Function} config.scheduleUiRefresh
 * @param {Function} config.setStatus
 * @returns {Object} Unified public API
 */
export function createTerminalView(config) {
  const {
    dispatcher,
    stateManager,
    elements,
    appState,
    markSessionInput,
    scheduleUiRefresh,
    setStatus,
  } = config;

  // Initialize feature state slice
  stateManager.setState("features.terminalView", {
    activeTerminalId: null,
    isSearchOpen: false,
    contextMenuTarget: null,
    searchQuery: "",
    searchResultIndex: -1,
    manualTerminals: {
      subtitles: {},
      initialized: {},
    },
  });

  // Create sub-features
  const agentTerminal = createAgentTerminal({
    dispatcher,
    stateManager,
    elements,
    appState,
    markSessionInput,
    scheduleUiRefresh,
    setStatus,
  });

  const manualTerminals = createManualTerminals({
    dispatcher,
    stateManager,
    elements,
    appState,
    scheduleUiRefresh,
    setStatus,
    createWebLinksAddon: agentTerminal.createWebLinksAddon,
    attachTerminalClipboardHandlers:
      agentTerminal.attachTerminalClipboardHandlers,
  });

  // Wire dispatcher commands
  dispatcher.on("selectSession", (sessionId) => {
    agentTerminal.showSessionTerminal(sessionId);
  });

  dispatcher.on("clearTerminalSearch", () => {
    agentTerminal.closeAgentSearch();
  });

  dispatcher.on("executeTerminalSearch", (direction) => {
    agentTerminal.runAgentSearch(direction);
  });

  // Add dispatcher listeners for session and manual terminal events
  function setupDispatcherListeners(dispatcher) {
    // Session PTY output
    dispatcher.on("session:dataReceived", ({ sessionId, data }) => {
      agentTerminal.appendSessionData?.(sessionId, data);
      manualTerminals.appendSessionData?.(sessionId, data);
      // Optionally trigger UI refresh if needed
      scheduleUiRefresh?.();
    });

    // Session PTY exit
    dispatcher.on("session:exited", ({ sessionId, exitCode, signal }) => {
      agentTerminal.handleSessionExit?.(sessionId, exitCode, signal);
      manualTerminals.handleSessionExit?.(sessionId, exitCode, signal);
      scheduleUiRefresh?.();
    });

    // Manual terminal output
    dispatcher.on(
      "manualTerminal:dataReceived",
      ({ sessionId, terminalId, data }) => {
        manualTerminals.appendManualTerminalData?.(sessionId, terminalId, data);
      },
    );

    // Manual terminal exit
    dispatcher.on(
      "manualTerminal:exited",
      ({ sessionId, terminalId, exitCode, signal }) => {
        manualTerminals.handleManualTerminalExit?.(
          sessionId,
          terminalId,
          exitCode,
          signal,
        );
      },
    );
  }

  setupDispatcherListeners(dispatcher);

  // Return unified public API
  return {
    // Agent terminal methods
    getActiveTerminalInstance: () => agentTerminal.getActiveTerminalInstance(),
    getActiveAgentSearchAddon: () => agentTerminal.getActiveAgentSearchAddon(),
    createSessionTerminal: (sessionId) =>
      agentTerminal.createSessionTerminal(sessionId),
    showSessionTerminal: (sessionId) =>
      agentTerminal.showSessionTerminal(sessionId),
    openAgentSearch: (opts) => agentTerminal.openAgentSearch(opts),
    closeAgentSearch: (opts) => agentTerminal.closeAgentSearch(opts),
    runAgentSearch: (direction, opts) =>
      agentTerminal.runAgentSearch(direction, opts),
    resizeSession: () => agentTerminal.resizeSession(),
    closeTerminalContextMenu: () => agentTerminal.closeTerminalContextMenu(),
    openTerminalContextMenu: (event, target) =>
      agentTerminal.openTerminalContextMenu(event, target),

    // Manual terminals methods
    createManualTerminal: (sessionId, terminalId) =>
      manualTerminals.createManualTerminal(sessionId, terminalId),
    ensureManualTerminal: (sessionId, terminalId) =>
      manualTerminals.ensureManualTerminal(sessionId, terminalId),
    showManualTerminal: (sessionId, terminalId) =>
      manualTerminals.showManualTerminal(sessionId, terminalId),
    getManualTerminalInstance: (sessionId, terminalId) =>
      manualTerminals.getManualTerminalInstance(sessionId, terminalId),
    updateManualTerminalSubtitle: (session, terminalId) =>
      manualTerminals.updateManualTerminalSubtitle(session, terminalId),
    resizeManualTerminal: (terminalId) =>
      manualTerminals.resizeManualTerminal(terminalId),
    resizeManualTerminals: () => manualTerminals.resizeManualTerminals(),
    setupDispatcherListeners,
  };
}
