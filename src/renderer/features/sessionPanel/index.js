/**
 * Session Panel Feature Module
 *
 * Responsible for rendering and managing session tabs in the UI.
 * This module provides the UI layer for session management, delegating
 * state changes back to the dispatcher via commands.
 *
 * Does NOT mutate global state directly - only communicates via dispatcher.emit()
 */

import { getNoSessionsHtml, getRunningSessionTabHtml, getStoppedSessionTabHtml } from "./sessionTabHtml.js";

/**
 * Creates a session panel feature module
 * @param {Object} config - Configuration object
 * @param {CommandDispatcher} config.dispatcher - Command dispatcher instance
 * @param {Object} config.elements - DOM element references
 * @param {HTMLElement} config.elements.sessionTabsList - Container for session tabs
 * @param {Function} config.deriveAttentionStatus - Function to derive attention status for a session
 * @param {Map} config.sessionProcesses - Map of session ID to process arrays
 * @param {Function} config.getProcessDisplayLabel - Function to get display label for a process
 * @returns {SessionPanel}
 */
export function createSessionPanel({
  dispatcher,
  elements,
  deriveAttentionStatus,
  sessionProcesses,
  getProcessDisplayLabel,
}) {
  if (!dispatcher) throw new Error("dispatcher is required");
  if (!elements?.sessionTabsList) throw new Error("elements.sessionTabsList is required");
  if (typeof deriveAttentionStatus !== "function")
    throw new Error("deriveAttentionStatus is required");
  if (!(sessionProcesses instanceof Map))
    throw new Error("sessionProcesses must be a Map");
  if (typeof getProcessDisplayLabel !== "function")
    throw new Error("getProcessDisplayLabel is required");

  const { sessionTabsList } = elements;

  return {
    /**
     * Render all session tabs
     * @param {Array<Object>} allSessions - Array of session objects, pre-sorted
     * @param {string} activeSessionId - ID of currently active session
     */
    render(allSessions, activeSessionId) {
      if (!Array.isArray(allSessions)) {
        console.warn("Session list is not an array");
        return;
      }

      if (allSessions.length === 0) {
        sessionTabsList.innerHTML = getNoSessionsHtml();
        return;
      }

      const tabs = allSessions
        .map((session) => {
          const attention = deriveAttentionStatus(session);
          const procs = sessionProcesses.get(session.id) || [];
          const isActive = activeSessionId === session.id;
          const primaryProc = procs[0] ? getProcessDisplayLabel(procs[0]) : "";
          const procSummary =
            procs.length > 0
              ? `${primaryProc}${procs.length > 1 ? ` +${procs.length - 1}` : ""}`
              : "";

          if (!session.isRunning) {
            return getStoppedSessionTabHtml(session, isActive, attention);
          }

          return getRunningSessionTabHtml(
            session,
            isActive,
            attention,
            procSummary
          );
        })
        .join("");

      sessionTabsList.innerHTML = tabs;
      this._attachEventListeners();
    },

    /**
     * Attach event listeners to session tabs
     * @private
     */
    _attachEventListeners() {
      // Handle main tab clicks (select session)
      const tabs = sessionTabsList.querySelectorAll(".session-tab");
      for (const tab of tabs) {
        tab.addEventListener("click", (event) => {
          const sessionId = event.currentTarget.getAttribute("data-session-id");
          if (sessionId) {
            dispatcher.emit("selectSession", sessionId);
          }
        });
      }

      // Handle restart button clicks
      const restartButtons = sessionTabsList.querySelectorAll(".session-action-restart");
      for (const button of restartButtons) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const sessionId = event.currentTarget.getAttribute("data-session-id");
          if (sessionId) {
            dispatcher.emit("restartSession", sessionId);
          }
        });
      }

      // Handle remove button clicks
      const removeButtons = sessionTabsList.querySelectorAll(".session-action-remove");
      for (const button of removeButtons) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const sessionId = event.currentTarget.getAttribute("data-session-id");
          if (sessionId) {
            dispatcher.emit("removeSession", sessionId);
          }
        });
      }
    },

    /**
     * Update a single session tab (partial update)
     * Called when a session's state changes
     * @param {Object} session - Session object to update
     * @param {string} activeSessionId - ID of currently active session
     */
    updateSessionTab(session, activeSessionId) {
      if (!session || typeof session.id !== "string") {
        console.warn("Invalid session passed to updateSessionTab");
        return;
      }

      const tab = sessionTabsList.querySelector(
        `[data-session-id="${session.id}"]`
      );
      if (!tab) {
        console.warn(`Tab not found for session ${session.id}`);
        return;
      }

      const attention = deriveAttentionStatus(session);
      const procs = sessionProcesses.get(session.id) || [];
      const isActive = activeSessionId === session.id;
      const primaryProc = procs[0] ? getProcessDisplayLabel(procs[0]) : "";
      const procSummary =
        procs.length > 0
          ? `${primaryProc}${procs.length > 1 ? ` +${procs.length - 1}` : ""}`
          : "";

      // For stopped sessions, we need to update the parent group
      if (!session.isRunning) {
        const group = tab.closest(".session-tab-group");
        if (group) {
          const newHtml = getStoppedSessionTabHtml(session, isActive, attention);
          group.outerHTML = newHtml;
          this._attachEventListeners();
        }
        return;
      }

      // For running sessions, update the tab in-place
      const newHtml = getRunningSessionTabHtml(
        session,
        isActive,
        attention,
        procSummary
      );
      tab.outerHTML = newHtml;
      this._attachEventListeners();
    },

    /**
     * Select a session tab (visual indication)
     * This just updates the UI; actual state change is delegated to dispatcher
     * @param {string} sessionId - Session ID to select
     */
    selectSession(sessionId) {
      // Clear previous active state
      const previousActive = sessionTabsList.querySelector(".session-tab.active");
      if (previousActive) {
        previousActive.classList.remove("active");
      }

      // Mark parent group as active if exists
      const previousActiveGroup = sessionTabsList.querySelector(".session-tab-group.active");
      if (previousActiveGroup) {
        previousActiveGroup.classList.remove("active");
      }

      // Set new active state
      const newActive = sessionTabsList.querySelector(
        `[data-session-id="${sessionId}"]`
      );
      if (newActive) {
        newActive.classList.add("active");
        const group = newActive.closest(".session-tab-group");
        if (group) {
          group.classList.add("active");
        }
      }
    },
  };
}
