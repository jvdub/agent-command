/**
 * Agent Terminal View Feature
 *
 * Manages session terminal rendering, search, and context menu operations.
 * Owns state under stateManager.features.terminalView
 */

import { Terminal } from "../../vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "../../vendor/@xterm/addon-fit/lib/addon-fit.mjs";
import { SearchAddon } from "../../vendor/@xterm/addon-search/lib/addon-search.mjs";
import { WebLinksAddon } from "../../vendor/@xterm/addon-web-links/lib/addon-web-links.mjs";

import { agenticApp } from "../../agenticApp.js";
import {
  FILE_REFERENCE_PATTERN,
  TERMINAL_OPTIONS,
  TERMINAL_SEARCH_OPTIONS,
} from "../../constants.js";
import { normalizeCandidateFilePath } from "../../utils.js";

/**
 * Creates the agent terminal feature
 * @param {Object} config
 * @param {CommandDispatcher} config.dispatcher
 * @param {StateManager} config.stateManager
 * @param {Object} config.elements - DOM element references
 * @param {Object} config.appState - Legacy app state (sessions, sessionTerminals, sessionBuffers, uiState)
 * @param {Function} config.markSessionInput
 * @param {Function} config.scheduleUiRefresh
 * @param {Function} config.setStatus
 * @returns {Object} Public API for agent terminal
 */
export function createAgentTerminal(config) {
  const {
    dispatcher,
    stateManager,
    elements,
    markSessionInput,
    scheduleUiRefresh,
    setStatus,
  } = config;

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

  function ensureSessionBuffer(sessionId) {
    const sessionBuffers =
      stateManager.getState("data.sessionBuffers") || new Map();
    if (
      !sessionBuffers.has(sessionId) ||
      sessionBuffers.get(sessionId) === undefined
    ) {
      sessionBuffers.set(sessionId, "");
      stateManager.setState("data.sessionBuffers", sessionBuffers);
    }

    return sessionBuffers;
  }

  function appendSessionBuffer(sessionId, chunk) {
    const sessionBuffers = ensureSessionBuffer(sessionId);
    const buffer = sessionBuffers.get(sessionId);
    sessionBuffers.set(sessionId, buffer + chunk);
    stateManager.setState("data.sessionBuffers", sessionBuffers);
  }

  return {
    isClipboardShortcut,
    copyTerminalSelection,
    pasteIntoTerminal,
    ensureSessionBuffer,
    appendSessionBuffer,
  };
}
