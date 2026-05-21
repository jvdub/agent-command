/**
 * Session Tab HTML Helper
 *
 * Provides functions for building session tab HTML elements.
 * These helpers are used by the session panel feature to render tabs.
 */

import { escapeHtml, getSessionDisplayName, shortId } from "../../utils.js";

/**
 * Get HTML for a stopped session tab with action buttons
 * @param {Object} session - Session object
 * @param {string} session.id - Session ID
 * @param {string} session.label - Session label
 * @param {string} session.cwd - Current working directory
 * @param {Array} session.args - Command arguments
 * @param {boolean} isActive - Whether this session is currently active
 * @param {Object} attention - Attention status object with label and className
 * @returns {string} HTML string
 */
export function getStoppedSessionTabHtml(session, isActive, attention) {
  if (!session || typeof session.id !== "string") {
    console.warn("Invalid session passed to getStoppedSessionTabHtml");
    return "";
  }

  const active = isActive ? "active" : "";
  const sessionName = escapeHtml(getSessionDisplayName(session));
  const sessionId = shortId(session.id);
  const attentionLabel = escapeHtml(attention?.label || "Idle");

  return `
    <div class="session-tab-group ${active}">
      <button type="button" class="session-tab stopped-tab ${active}" data-session-id="${escapeHtml(session.id)}">
        <div class="session-tab-top">
          <p class="session-tab-name">${sessionName}</p>
          <p class="session-tab-id">#${escapeHtml(sessionId)}</p>
        </div>
        <p class="session-tab-attention">${attentionLabel}</p>
      </button>
      <div class="session-tab-actions">
        <button type="button" class="session-action-restart" data-session-id="${escapeHtml(session.id)}" title="Restart session">Restart</button>
        <button type="button" class="session-action-remove" data-session-id="${escapeHtml(session.id)}" title="Remove session">Remove</button>
      </div>
    </div>
  `;
}

/**
 * Get HTML for a running session tab
 * @param {Object} session - Session object
 * @param {string} session.id - Session ID
 * @param {string} session.label - Session label
 * @param {string} session.cwd - Current working directory
 * @param {Array} session.args - Command arguments
 * @param {boolean} isActive - Whether this session is currently active
 * @param {Object} attention - Attention status object with label and className
 * @param {string} procSummary - Process summary text (optional)
 * @returns {string} HTML string
 */
export function getRunningSessionTabHtml(
  session,
  isActive,
  attention,
  procSummary = ""
) {
  if (!session || typeof session.id !== "string") {
    console.warn("Invalid session passed to getRunningSessionTabHtml");
    return "";
  }

  const active = isActive ? "active" : "";
  const attentionClass = attention?.className || "";
  const sessionName = escapeHtml(getSessionDisplayName(session));
  const sessionId = shortId(session.id);
  const attentionLabel = escapeHtml(attention?.label || "Idle");
  const procHtml = procSummary ? `<p class="session-tab-proc">Process: ${procSummary}</p>` : "";

  return `
    <button type="button" class="session-tab ${active} ${attentionClass}" data-session-id="${escapeHtml(session.id)}">
      <div class="session-tab-top">
        <p class="session-tab-name">${sessionName}</p>
        <p class="session-tab-id">#${escapeHtml(sessionId)}</p>
      </div>
      <p class="session-tab-attention">${attentionLabel}</p>
      ${procHtml}
    </button>
  `;
}

/**
 * Get HTML for the "no sessions" message
 * @returns {string} HTML string
 */
export function getNoSessionsHtml() {
  return '<p class="status-meta">No sessions</p>';
}
