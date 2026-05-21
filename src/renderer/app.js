import { UI_REFRESH_INTERVAL_MS } from "./constants.js";
import { elements } from "./dom.js";
import {
  deriveAttentionStatus,
  ensureSessionInsight,
  markSessionInput,
  rehydrateInsightFromBuffer,
  updateInsightFromOutput,
} from "./insights.js";
import {
  capabilities,
  editorRuntime,
  editorState,
  manualTerminalBuffers,
  manualTerminals,
  sessionBuffers,
  sessionInsights,
  sessionProcesses,
  sessionTerminals,
  sessions,
  uiState,
  workspaceFilesCache,
  workspaceSearchState,
} from "./state.js";
import {
  escapeHtml,
  getProcessDisplayLabel,
  getSessionDisplayName,
  shortId,
} from "./utils.js";
import { agenticApp } from "./agenticApp.js";
import { createCommandDispatcher } from "./commandDispatcher.js";
import { createTerminalManager } from "./terminalRuntime.js";
import { createWorkspaceTools } from "./workspaceTools.js";
import { setupIpcEventBinding } from "./ipcEventBinding.js";

const {
  emptyView,
  terminalView: terminalViewPanel,
  sessionForm,
  newSessionButton,
  newSessionPopover,
  openLauncherEmptyButton,
  labelInput,
  commandInput,
  argsInput,
  cwdInput,
  pickDirectoryButton,
  stopSessionButton,
  sendInterruptButton,
  openFileDrawerButton,
  manualSendInterruptButton1,
  manualSendInterruptButton2,
  toggleProcessPanelButton,
  sessionStatus,
  sessionMeta,
  sessionTabsList,
  terminalTitle,
  terminalSubtitle,
  processDetailsPanel,
  processPanelMeta,
  processDetailsList,
  terminalContextMenu,
  workspaceSearchInput,
} = elements;

function ensureSessionBuffer(sessionId) {
  if (!sessionBuffers.has(sessionId)) {
    sessionBuffers.set(sessionId, "");
  }
}

function appendSessionBuffer(sessionId, chunk) {
  ensureSessionBuffer(sessionId);
  sessionBuffers.set(sessionId, `${sessionBuffers.get(sessionId)}${chunk}`);
}

function setProcessInspectionSupport(supported) {
  const isSupported = supported !== false;
  capabilities.processInspectionSupported = isSupported;

  toggleProcessPanelButton.classList.toggle("hidden", !isSupported);
  toggleProcessPanelButton.disabled = !isSupported;

  if (!isSupported) {
    uiState.isProcessPanelOpen = false;
    toggleProcessPanelButton.classList.remove("active");
    processDetailsPanel.classList.add("hidden");
    return;
  }

  renderProcessDetails(uiState.activeSessionId);
}

function setStatus(label, meta) {
  sessionStatus.textContent = label;
  sessionMeta.textContent = meta;
}

function scheduleUiRefresh() {
  if (uiState.refreshScheduled) {
    return;
  }

  uiState.refreshScheduled = true;
  uiState.refreshTimeoutId = window.setTimeout(() => {
    uiState.refreshScheduled = false;
    uiState.refreshTimeoutId = null;
    refreshVisibleUi();
  }, UI_REFRESH_INTERVAL_MS);
}

// Create dispatcher for IPC/event flow
const dispatcher = createCommandDispatcher();

let workspaceTools;

const terminalManager = createTerminalManager({
  markSessionInput,
  openReferencedFile: (sessionId, filePath, lineNumber) =>
    workspaceTools?.openReferencedFile(sessionId, filePath, lineNumber),
  scheduleUiRefresh,
  setStatus,
});

workspaceTools = createWorkspaceTools({
  getActiveTerminalInstance: () => terminalManager.getActiveTerminalInstance(),
  setStatus,
});

setupIpcEventBinding(dispatcher, agenticApp);

dispatcher.on("sessions:changed", (payload) => {
  updateSessions(Array.isArray(payload) ? payload : payload?.sessions || []);
});

dispatcher.on("session:dataReceived", ({ sessionId, data }) => {
  if (!sessionId || typeof data !== "string") {
    return;
  }

  appendSessionBuffer(sessionId, data);
  const instance = sessionTerminals.get(sessionId);
  if (instance) {
    instance.terminal.write(data);
  }

  updateInsightFromOutput(sessionId, data);
  scheduleUiRefresh();
});

dispatcher.on("session:exited", ({ sessionId, exitCode, signal }) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  sessions.set(sessionId, {
    ...session,
    isRunning: false,
    exitCode,
    signal,
  });
  scheduleUiRefresh();
});

dispatcher.on("manualTerminal:dataReceived", ({ sessionId, terminalId, data }) => {
  if (!sessionId || typeof data !== "string") {
    return;
  }

  const key = `${sessionId}:${String(terminalId || "1")}`;
  const existing = manualTerminalBuffers.get(key) || "";
  manualTerminalBuffers.set(key, `${existing}${data}`);

  const instance = manualTerminals.get(key);
  if (instance) {
    instance.terminal.write(data);
  }
});

dispatcher.on("manualTerminal:exited", ({ sessionId, terminalId, exitCode, signal }) => {
  const key = `${sessionId}:${String(terminalId || "1")}`;
  const instance = manualTerminals.get(key);
  if (!instance) {
    return;
  }

  instance.initialized = false;
  instance.terminal.write(
    `\r\n[manual terminal exited${typeof exitCode === "number" ? ` (${exitCode})` : ""}${signal ? ` signal ${signal}` : ""}]\r\n`,
  );
});

// Wire dispatcher event: file reference clicked → open file
dispatcher.on("fileReferenceClicked", ({ sessionId, filePath, lineNumber }) => {
  workspaceTools.openReferencedFile(sessionId, filePath, lineNumber);
});

function refreshVisibleUi() {
  renderSessionTabs();

  if (!uiState.activeSessionId) {
    showEmptyView(false);
    return;
  }

  const active = sessions.get(uiState.activeSessionId);
  if (!active) {
    return;
  }

  renderTerminalHeader(active);
  terminalManager.updateManualTerminalSubtitle(active, "1");
  terminalManager.updateManualTerminalSubtitle(active, "2");
  setTerminalActionsEnabled(active);
  renderProcessDetails(active.id);
}

function setTerminalActionsEnabled(session) {
  const enabled = Boolean(session?.isRunning);
  stopSessionButton.disabled = !enabled;
  sendInterruptButton.disabled = !enabled;
}

function getSessionStatusLabel(session) {
  if (session.isRunning) {
    return "Running";
  }

  if (typeof session.exitCode === "number") {
    return `Exited (${session.exitCode})`;
  }

  return "Stopped";
}

function renderSessionTabs() {
  const allSessions = Array.from(sessions.values()).sort(
    (left, right) => right.createdAt - left.createdAt,
  );

  if (allSessions.length === 0) {
    sessionTabsList.innerHTML = '<p class="status-meta">No sessions</p>';
    return;
  }

  const tabs = allSessions
    .map((session) => {
      const attention = deriveAttentionStatus(session);
      const procs = sessionProcesses.get(session.id) || [];
      const isActive = uiState.activeSessionId === session.id;
      const primaryProc = procs[0] ? getProcessDisplayLabel(procs[0]) : "";
      const procSummary =
        procs.length > 0
          ? `${escapeHtml(primaryProc)}${procs.length > 1 ? ` +${procs.length - 1}` : ""}`
          : "";

      if (!session.isRunning) {
        return `
          <div class="session-tab-group ${isActive ? "active" : ""}">
            <button type="button" class="session-tab stopped-tab ${isActive ? "active" : ""}" data-session-id="${session.id}">
              <div class="session-tab-top">
                <p class="session-tab-name">${escapeHtml(getSessionDisplayName(session))}</p>
                <p class="session-tab-id">#${shortId(session.id)}</p>
              </div>
              <p class="session-tab-attention">${attention.label}</p>
            </button>
            <div class="session-tab-actions">
              <button type="button" class="session-action-restart" data-session-id="${session.id}" title="Restart session">Restart</button>
              <button type="button" class="session-action-remove" data-session-id="${session.id}" title="Remove session">Remove</button>
            </div>
          </div>
        `;
      }

      return `
        <button type="button" class="session-tab ${isActive ? "active" : ""} ${attention.className}" data-session-id="${session.id}">
          <div class="session-tab-top">
            <p class="session-tab-name">${escapeHtml(getSessionDisplayName(session))}</p>
            <p class="session-tab-id">#${shortId(session.id)}</p>
          </div>
          <p class="session-tab-attention">${attention.label}</p>
          ${procSummary ? `<p class="session-tab-proc">Process: ${procSummary}</p>` : ""}
        </button>
      `;
    })
    .join("");

  sessionTabsList.innerHTML = tabs;
}

function showEmptyView(shouldRefresh = true) {
  emptyView.classList.remove("hidden");
  terminalViewPanel.classList.add("hidden");
  processDetailsPanel.classList.add("hidden");
  terminalManager.closeAgentSearch({ restoreFocus: false });
  workspaceTools.closeWorkspaceSearch({ restoreFocus: false });

  for (const instance of sessionTerminals.values()) {
    instance.mount.classList.add("hidden");
  }

  for (const instance of manualTerminals.values()) {
    instance.mount.classList.add("hidden");
  }

  uiState.activeSessionId = null;
  workspaceTools.closeFileEditorModal(true);
  if (shouldRefresh) {
    refreshVisibleUi();
  }
}

function renderTerminalHeader(session) {
  terminalTitle.textContent = getSessionDisplayName(session);
  terminalSubtitle.textContent = `${session.cwd} - ${getSessionStatusLabel(session)}`;
}

function renderProcessDetails(sessionId) {
  if (!capabilities.processInspectionSupported) {
    processDetailsPanel.classList.add("hidden");
    return;
  }

  if (!uiState.isProcessPanelOpen || !sessionId) {
    processDetailsPanel.classList.add("hidden");
    return;
  }

  processDetailsPanel.classList.remove("hidden");
  const processes = sessionProcesses.get(sessionId) || [];
  processPanelMeta.textContent = `${processes.length} running`;

  if (processes.length === 0) {
    processDetailsList.innerHTML =
      '<p class="status-meta">No non-default spawned processes detected.</p>';
    return;
  }

  processDetailsList.innerHTML = processes
    .map((proc) => {
      const label = getProcessDisplayLabel(proc);
      const command = proc.cmdline || proc.comm || "";
      return `
        <article class="process-row">
          <div class="process-row-top">
            <p class="process-name">${escapeHtml(label)}</p>
            <p class="process-meta">PID ${proc.pid} · ${escapeHtml(proc.state)} · depth ${proc.depth ?? 0}</p>
          </div>
          <p class="process-command">${escapeHtml(command)}</p>
        </article>
      `;
    })
    .join("");
}

async function openTerminalView(sessionId) {
  if (
    editorState.open &&
    uiState.activeSessionId &&
    uiState.activeSessionId !== sessionId
  ) {
    const closed = workspaceTools.closeFileEditorModal();
    if (!closed) {
      return;
    }
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  if (
    uiState.activeSessionId &&
    uiState.activeSessionId !== sessionId &&
    uiState.isAgentSearchOpen
  ) {
    terminalManager.closeAgentSearch({ restoreFocus: false });
  }

  if (
    uiState.activeSessionId &&
    uiState.activeSessionId !== sessionId &&
    uiState.isWorkspaceSearchOpen
  ) {
    workspaceTools.closeWorkspaceSearch({ restoreFocus: false });
  }

  uiState.activeSessionId = sessionId;
  emptyView.classList.add("hidden");
  terminalViewPanel.classList.remove("hidden");
  renderSessionTabs();
  renderTerminalHeader(session);
  terminalManager.updateManualTerminalSubtitle(session, "1");
  terminalManager.updateManualTerminalSubtitle(session, "2");
  setTerminalActionsEnabled(session);
  renderProcessDetails(sessionId);
  terminalManager.showSessionTerminal(sessionId);
  await terminalManager.resizeSession();
  await terminalManager.showManualTerminal(sessionId, "1");
  await terminalManager.showManualTerminal(sessionId, "2");
  await terminalManager.resizeManualTerminals();
}

function updateSessions(payload) {
  const incomingIds = new Set(payload.map((session) => session.id));

  for (const existingId of sessions.keys()) {
    if (!incomingIds.has(existingId)) {
      sessionProcesses.delete(existingId);
      sessionInsights.delete(existingId);
      sessionBuffers.delete(existingId);
      for (const key of Array.from(manualTerminalBuffers.keys())) {
        if (key.startsWith(`${existingId}:`)) {
          manualTerminalBuffers.delete(key);
        }
      }
      for (const [key, instance] of manualTerminals.entries()) {
        if (!key.startsWith(`${existingId}:`)) {
          continue;
        }

        instance.mount.remove();
        manualTerminals.delete(key);
      }
    }
  }

  sessions.clear();
  for (const session of payload) {
    sessions.set(session.id, session);
    const priorBuffer = sessionBuffers.get(session.id) || "";
    const incomingBuffer =
      typeof session.outputBuffer === "string" ? session.outputBuffer : null;
    sessionBuffers.set(
      session.id,
      incomingBuffer !== null ? incomingBuffer : priorBuffer,
    );
    rehydrateInsightFromBuffer(session);
  }

  if (uiState.activeSessionId && !sessions.has(uiState.activeSessionId)) {
    workspaceTools.closeFileEditorModal(true);
    showEmptyView(false);
  }

  refreshVisibleUi();
  pollSessionProcesses();
}

function upsertSession(session) {
  if (!session?.id) {
    return;
  }

  const next = Array.from(sessions.values()).filter(
    (existing) => existing.id !== session.id,
  );
  next.push(session);
  updateSessions(next);
}

async function initializeContext() {
  const context = await agenticApp.getContext();
  uiState.defaultWorkspaceRoot = context.cwd;
  uiState.platformName = context.platform || "linux";
  setProcessInspectionSupport(context.processInspectionSupported);
  cwdInput.value = context.cwd;
  setStatus("Idle", `Default directory ${context.cwd}`);

  const existing = await agenticApp.listSessions();
  updateSessions(existing.sessions || []);

  const runningCount = (existing.sessions || []).filter(
    (session) => session.isRunning,
  ).length;
  if (runningCount > 0) {
    setStatus(
      "Restored",
      `${runningCount} running session${runningCount === 1 ? "" : "s"} recovered`,
    );
  }
}

async function startSession(event) {
  event.preventDefault();

  const command = commandInput.value.trim();
  const label = labelInput?.value?.trim() || "";
  const args = argsInput.value;
  const cwd = cwdInput.value.trim();

  if (!command) {
    setStatus("Error", "Command is required");
    return;
  }

  try {
    const result = await agenticApp.startSession({
      label,
      command,
      args,
      cwd,
      cols: 120,
      rows: 36,
    });
    const session = result.session;

    upsertSession(session);
    ensureSessionBuffer(session.id);
    ensureSessionInsight(session.id);
    terminalManager.createSessionTerminal(session.id);

    setStatus("Running", `${getSessionDisplayName(session)} (${session.cwd})`);
    newSessionPopover.classList.add("hidden");
    openTerminalView(session.id);
  } catch (error) {
    setStatus("Error", error.message || "Unable to start session");
  }
}

async function stopSession() {
  if (!uiState.activeSessionId) {
    return;
  }

  try {
    await agenticApp.stopSession(uiState.activeSessionId);
    setStatus("Stopped", "Session terminated by user");
  } catch (error) {
    setStatus("Error", error.message || "Unable to stop session");
  }
}

async function sendInterrupt() {
  if (!uiState.activeSessionId) {
    return;
  }

  await agenticApp.writeToSession(uiState.activeSessionId, "\u0003");
  markSessionInput(uiState.activeSessionId);
  scheduleUiRefresh();
}

async function sendManualInterrupt(terminalId) {
  if (!uiState.activeSessionId) {
    return;
  }

  await agenticApp.writeToManualTerminal(
    uiState.activeSessionId,
    "\u0003",
    terminalId,
  );
}

async function pickDirectory() {
  const selected = await agenticApp.pickDirectory();
  if (selected) {
    cwdInput.value = selected;
  }
}

function toggleSessionPopover(forceOpen = null) {
  const shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : newSessionPopover.classList.contains("hidden");

  newSessionPopover.classList.toggle("hidden", !shouldOpen);

  if (shouldOpen) {
    commandInput.focus();
  }
}

function toggleProcessPanel() {
  if (!capabilities.processInspectionSupported) {
    return;
  }

  uiState.isProcessPanelOpen = !uiState.isProcessPanelOpen;
  toggleProcessPanelButton.classList.toggle(
    "active",
    uiState.isProcessPanelOpen,
  );
  renderProcessDetails(uiState.activeSessionId);

  if (uiState.isProcessPanelOpen) {
    pollSessionProcesses();
  }
}

function selectSessionFromSidebar(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const tab = target.closest(".session-tab");
  if (tab?.dataset.sessionId) {
    event.preventDefault();
    openTerminalView(tab.dataset.sessionId);
  }
}

async function restartSessionFromSidebar(sessionId) {
  try {
    const result = await agenticApp.restartSession(sessionId);
    const session = result.session;

    upsertSession(session);
    ensureSessionBuffer(session.id);
    ensureSessionInsight(session.id);
    terminalManager.createSessionTerminal(session.id);

    setStatus("Running", `${getSessionDisplayName(session)} (${session.cwd})`);
    openTerminalView(session.id);
  } catch (error) {
    setStatus("Error", error.message || "Unable to restart session");
  }
}

async function removeSessionFromSidebar(sessionId) {
  try {
    await agenticApp.removeSession(sessionId);
    setStatus("Removed", "Session deleted");
    if (uiState.activeSessionId === sessionId) {
      showEmptyView(false);
    }
  } catch (error) {
    setStatus("Error", error.message || "Unable to remove session");
  }
}

async function pollSessionProcesses() {
  if (typeof agenticApp.getSessionProcesses !== "function") {
    return;
  }

  if (!capabilities.processInspectionSupported) {
    return;
  }

  for (const [id, session] of sessions.entries()) {
    if (!session.isRunning) {
      sessionProcesses.delete(id);
    }
  }

  if (!uiState.activeSessionId || !uiState.isProcessPanelOpen) {
    scheduleUiRefresh();
    return;
  }

  const activeSession = sessions.get(uiState.activeSessionId);
  if (!activeSession?.isRunning) {
    sessionProcesses.delete(uiState.activeSessionId);
    scheduleUiRefresh();
    return;
  }

  try {
    const result = await agenticApp.getSessionProcesses(
      uiState.activeSessionId,
    );

    if (result?.supported === false) {
      setProcessInspectionSupport(false);
      sessionProcesses.delete(uiState.activeSessionId);
      scheduleUiRefresh();
      return;
    }

    setProcessInspectionSupport(result?.supported);
    sessionProcesses.set(uiState.activeSessionId, result?.processes || []);
  } catch {
    sessionProcesses.set(uiState.activeSessionId, []);
  }

  scheduleUiRefresh();
}

window.addEventListener("resize", () => {
  terminalManager.resizeSession();
  terminalManager.resizeManualTerminals();
});

sessionForm.addEventListener("submit", startSession);
pickDirectoryButton.addEventListener("click", pickDirectory);
stopSessionButton.addEventListener("click", stopSession);
sendInterruptButton.addEventListener("click", sendInterrupt);
openFileDrawerButton.addEventListener("click", () => {
  workspaceTools.openFileDrawer();
});
manualSendInterruptButton1.addEventListener("click", () =>
  sendManualInterrupt("1"),
);
manualSendInterruptButton2.addEventListener("click", () =>
  sendManualInterrupt("2"),
);
toggleProcessPanelButton.addEventListener("click", toggleProcessPanel);
newSessionButton.addEventListener("click", (event) => {
  event.stopImmediatePropagation();
  toggleSessionPopover(true);
});
openLauncherEmptyButton.addEventListener("click", (event) => {
  event.stopImmediatePropagation();
  toggleSessionPopover(true);
});

sessionTabsList.addEventListener("pointerdown", selectSessionFromSidebar);
sessionTabsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const restartBtn = target.closest(".session-action-restart");
  if (restartBtn?.dataset.sessionId) {
    event.preventDefault();
    event.stopPropagation();
    restartSessionFromSidebar(restartBtn.dataset.sessionId);
    return;
  }

  const removeBtn = target.closest(".session-action-remove");
  if (removeBtn?.dataset.sessionId) {
    event.preventDefault();
    event.stopPropagation();
    removeSessionFromSidebar(removeBtn.dataset.sessionId);
  }
});
sessionTabsList.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    selectSessionFromSidebar(event);
  }
});

document.addEventListener("click", (event) => {
  if (
    !terminalContextMenu.classList.contains("hidden") &&
    !terminalContextMenu.contains(event.target)
  ) {
    terminalManager.closeTerminalContextMenu();
  }

  if (newSessionPopover.classList.contains("hidden")) {
    return;
  }

  const target = event.target;
  if (
    newSessionPopover.contains(target) ||
    newSessionButton.contains(target) ||
    openLauncherEmptyButton.contains(target)
  ) {
    return;
  }

  newSessionPopover.classList.add("hidden");
});

document.addEventListener("keydown", (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    String(event.key || "").toLowerCase() === "p"
  ) {
    event.preventDefault();
    if (uiState.isWorkspaceSearchOpen) {
      workspaceSearchInput.focus();
      workspaceSearchInput.select();
    } else {
      workspaceTools.openWorkspaceSearch();
    }
    return;
  }

  if (
    !editorState.open &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    String(event.key || "").toLowerCase() === "f"
  ) {
    if (uiState.activeSessionId) {
      event.preventDefault();
      terminalManager.openAgentSearch();
    }
    return;
  }

  if (
    editorState.open &&
    (event.key === "s" || event.key === "S") &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();
    workspaceTools.saveOpenEditorFile("Saved");
    return;
  }

  if (event.key === "Escape") {
    if (uiState.isWorkspaceSearchOpen) {
      workspaceTools.closeWorkspaceSearch();
      return;
    }

    if (uiState.isAgentSearchOpen) {
      terminalManager.closeAgentSearch();
      return;
    }

    if (editorState.open) {
      workspaceTools.closeFileEditorModal();
      return;
    }

    terminalManager.closeTerminalContextMenu();
  }
});

setTerminalActionsEnabled(null);
setStatus("Idle", "No active process");
initializeContext().catch((error) => {
  setStatus("Error", error.message || "Unable to load app context");
});

setInterval(() => {
  refreshVisibleUi();
}, 3000);

setInterval(pollSessionProcesses, 3000);
