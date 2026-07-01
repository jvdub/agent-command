import { agenticApp } from "./agenticApp.js";
import { markdownToPlan, planToMarkdown } from "./managedRunPlanMarkdown.js";
import { allAttentionItems, renderInbox } from "./managedRunInbox.js";
import { renderInspector } from "./managedRunInspector.js";
import { renderJourney } from "./managedRunJourney.js";
import { currentAction, runProgress } from "./managedRunSelectors.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function prettyStatus(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function createManagedRunsView({ activateView, onSessionStarted, onOpenManagedRunFile, setStatus }) {
  const elements = {
    view: document.querySelector("#managed-run-view"),
    tabs: document.querySelector("#managed-run-tabs-list"),
    newButton: document.querySelector("#new-managed-run-button"),
    popover: document.querySelector("#new-managed-run-popover"),
    form: document.querySelector("#managed-run-form"),
    titleInput: document.querySelector("#managed-run-title-input"),
    repoInput: document.querySelector("#managed-run-repo-input"),
    specInput: document.querySelector("#managed-run-spec-input"),
    providerInput: document.querySelector("#managed-run-provider-input"),
    pickDirectory: document.querySelector("#managed-run-pick-directory"),
    planningModel: document.querySelector("#managed-run-planning-model"),
    implementationModel: document.querySelector("#managed-run-implementation-model"),
    verificationModel: document.querySelector("#managed-run-verification-model"),
    integrationModel: document.querySelector("#managed-run-integration-model"),
    viewTitle: document.querySelector("#managed-run-view-title"),
    viewMeta: document.querySelector("#managed-run-view-meta"),
    currentAction: document.querySelector("#managed-run-current-action"),
    progress: document.querySelector("#managed-run-progress"),
    planMeta: document.querySelector("#managed-run-plan-meta"),
    planPanel: document.querySelector("#managed-run-plan-panel"),
    planEditor: document.querySelector("#managed-run-plan-editor"),
    journey: document.querySelector("#managed-run-journey"),
    inspector: document.querySelector("#managed-run-inspector"),
    inboxList: document.querySelector("#managed-run-inbox-list"),
    inboxCount: document.querySelector("#managed-run-inbox-count"),
    eventList: document.querySelector("#managed-run-event-list"),
    usage: document.querySelector("#managed-run-usage"),
    generatePlan: document.querySelector("#managed-run-generate-plan"),
    shape: document.querySelector("#managed-run-shape"),
    savePlan: document.querySelector("#managed-run-save-plan"),
    approvePlan: document.querySelector("#managed-run-approve-plan"),
    start: document.querySelector("#managed-run-start"),
    pause: document.querySelector("#managed-run-pause"),
    cancel: document.querySelector("#managed-run-cancel"),
    accept: document.querySelector("#managed-run-accept"),
    archive: document.querySelector("#managed-run-archive"),
    takeover: document.querySelector("#managed-run-takeover"),
    routingProvider: document.querySelector("#managed-run-routing-provider"),
    routingPlannerModel: document.querySelector("#managed-run-routing-planner-model"),
    routingImplementerModel: document.querySelector("#managed-run-routing-implementer-model"),
    routingVerifierModel: document.querySelector("#managed-run-routing-verifier-model"),
    routingIntegrationModel: document.querySelector("#managed-run-routing-integration-model"),
    saveRouting: document.querySelector("#managed-run-save-routing"),
  };

  const runs = new Map();
  const liveOutput = new Map();
  const workerDetailCache = new Map();
  let activeRunId = null;
  let selectedTaskId = null;
  let selectedWorkerId = null;
  let workerDetailState = "idle";
  let renderedPlanKey = "";

  const activeRun = () => activeRunId ? runs.get(activeRunId) : null;

  function renderTabs() {
    const list = [...runs.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    elements.tabs.innerHTML = list.length ? list.map((run) => `
      <button type="button" class="managed-run-tab ${run.id === activeRunId ? "active" : ""}" data-managed-run-id="${escapeHtml(run.id)}">
        <p class="managed-run-tab-title">${escapeHtml(run.title)}</p>
        <p class="managed-run-tab-meta">${escapeHtml(prettyStatus(run.status))} · ${runProgress(run).verified}/${runProgress(run).total} verified</p>
      </button>`).join("") : '<p class="status-meta">No managed runs.</p>';
  }

  function renderInboxSurface() {
    const visibleRuns = [...runs.values()].filter((run) => !run.archived);
    elements.inboxList.innerHTML = renderInbox(visibleRuns, activeRunId);
    elements.inboxCount.textContent = String(allAttentionItems(visibleRuns).length);
  }

  function defaultSelection(run) {
    if (selectedTaskId && (selectedTaskId === "final-verification" || run.tasks?.some((task) => task.id === selectedTaskId))) return;
    selectedTaskId = run.tasks?.find((task) => ["implementing", "verifying", "human_review_required", "retry_required"].includes(task.status))?.id || run.tasks?.[0]?.id || "final-verification";
  }

  function renderInspectorSurface() {
    const scrollTop = elements.inspector.scrollTop;
    const detail = selectedWorkerId ? workerDetailCache.get(selectedWorkerId) : null;
    elements.inspector.innerHTML = renderInspector({
      run: activeRun(), taskId: selectedTaskId, selectedWorkerId,
      workerDetail: detail, workerDetailState,
    });
    elements.inspector.scrollTop = scrollTop;
  }

  function renderEvents(run) {
    elements.eventList.innerHTML = [...(run.events || [])].reverse().slice(0, 100).map((event) => `
      <article class="managed-run-event"><p><strong>${escapeHtml(event.message)}</strong></p><p class="managed-run-event-detail">${escapeHtml(new Date(event.at).toLocaleString())} · ${escapeHtml(event.level)}</p></article>`).join("");
  }

  function populateRouting(run) {
    const pairs = [
      [elements.routingProvider, run.routing?.implementer?.provider || "codex"],
      [elements.routingPlannerModel, run.routing?.planner?.model],
      [elements.routingImplementerModel, run.routing?.implementer?.model],
      [elements.routingVerifierModel, run.routing?.verifier?.model],
      [elements.routingIntegrationModel, run.routing?.integration_verifier?.model],
    ];
    for (const [element, value] of pairs) if (document.activeElement !== element) element.value = value || "";
  }

  function renderActive() {
    const run = activeRun();
    if (!run) return;
    defaultSelection(run);
    elements.viewTitle.textContent = run.title;
    elements.viewMeta.textContent = `${prettyStatus(run.status)} · ${run.repoPath}`;
    elements.currentAction.textContent = currentAction(run);
    const progress = runProgress(run);
    elements.progress.textContent = `${progress.verified} of ${progress.total} tasks verified · ${progress.attempts} attempts · ${progress.retries} retries`;
    elements.planMeta.textContent = run.plan ? `Revision ${run.planRevision}${run.approvedRevision === run.planRevision ? " · approved" : " · approval required"}` : "No plan generated";
    if (!run.plan || run.approvedRevision !== run.planRevision) elements.planPanel.open = true;
    const planKey = `${run.id}:${run.planRevision}`;
    if (planKey !== renderedPlanKey && document.activeElement !== elements.planEditor) {
      elements.planEditor.value = planToMarkdown(run.plan);
      renderedPlanKey = planKey;
    }
    populateRouting(run);
    elements.journey.innerHTML = renderJourney(run, selectedTaskId);
    renderInspectorSurface();
    renderInboxSurface();
    renderEvents(run);
    const usage = run.usage || {};
    elements.usage.textContent = `${usage.workerCount || 0} workers · ${usage.hasTokenData ? `${(usage.inputTokens || 0) + (usage.outputTokens || 0)} tokens` : "token data unavailable"}`;
    const active = Boolean(run.activeWorkerId) || ["planning", "running", "final_verification"].includes(run.status);
    elements.generatePlan.disabled = active;
    elements.savePlan.disabled = active || !elements.planEditor.value.trim();
    elements.approvePlan.disabled = run.status !== "approval_required";
    elements.start.disabled = !["ready", "paused", "review_required"].includes(run.status) || run.finalVerification?.verdict === "pass";
    elements.start.textContent = run.status === "ready" ? "Start" : "Resume";
    elements.pause.disabled = !["ready", "running", "final_verification"].includes(run.status);
    elements.cancel.disabled = ["cancelled", "completed", "failed"].includes(run.status);
    elements.accept.disabled = run.finalVerification?.verdict !== "pass" || run.status !== "review_required";
    elements.archive.disabled = active;
    elements.shape.disabled = active;
    elements.takeover.disabled = active;
  }

  function show(runId, target = {}) {
    if (!runs.has(runId)) return;
    activeRunId = runId;
    selectedTaskId = target.taskId || selectedTaskId;
    selectedWorkerId = null;
    workerDetailState = "idle";
    activateView();
    elements.view.classList.remove("hidden");
    renderTabs();
    renderActive();
    if (target.section) requestAnimationFrame(() => elements.inspector.querySelector(`[data-inspector-section="${target.section}"]`)?.scrollIntoView({ block: "nearest" }));
  }

  function hide() {
    elements.view.classList.add("hidden");
    activeRunId = null;
    renderTabs();
  }

  function upsert(run) {
    runs.set(run.id, run);
    renderTabs();
    renderInboxSurface();
    if (run.id === activeRunId) renderActive();
  }

  async function perform(label, work) {
    try {
      setStatus(label, "Managed Run request in progress...");
      const run = await work();
      if (run?.id) upsert(run);
      setStatus(label, "Managed Run updated");
      return run;
    } catch (error) {
      setStatus("Error", error.message || "Managed Run request failed");
      return null;
    }
  }

  async function selectWorker(workerId) {
    selectedWorkerId = workerId;
    if (workerDetailCache.has(workerId)) {
      workerDetailState = "loaded";
      renderInspectorSurface();
      return;
    }
    workerDetailState = "loading";
    renderInspectorSurface();
    try {
      const detail = await agenticApp.getManagedRunWorkerDetail(activeRunId, workerId);
      workerDetailCache.set(workerId, detail);
      workerDetailState = "loaded";
    } catch {
      workerDetailState = "error";
    }
    renderInspectorSurface();
  }

  function bind() {
    elements.newButton.addEventListener("click", () => elements.popover.classList.toggle("hidden"));
    elements.pickDirectory.addEventListener("click", async () => {
      const selected = await agenticApp.pickDirectory();
      if (selected) elements.repoInput.value = selected;
    });
    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const repository = await perform("Checking repository", () => agenticApp.inspectManagedRunRepository(elements.repoInput.value));
      if (!repository?.isDirectory) return setStatus("Error", "Repository path must be a readable directory.");
      let initializeGit = false;
      if (!repository.isGitRepository) {
        initializeGit = window.confirm("This folder is not a Git repository. Initialize Git here and continue?");
        if (!initializeGit) return;
      }
      const run = await perform("Creating", () => agenticApp.createManagedRun({
        title: elements.titleInput.value, repoPath: elements.repoInput.value,
        specification: elements.specInput.value, provider: elements.providerInput.value,
        planningModel: elements.planningModel.value, implementationModel: elements.implementationModel.value,
        verificationModel: elements.verificationModel.value, integrationModel: elements.integrationModel.value,
        initializeGit,
      }));
      if (run) { elements.popover.classList.add("hidden"); show(run.id); }
    });
    elements.tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-managed-run-id]");
      if (tab) show(tab.dataset.managedRunId);
    });
    elements.inboxList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-inbox-run-id]");
      if (item) show(item.dataset.inboxRunId, { taskId: item.dataset.inboxTaskId || null, section: item.dataset.inboxSection });
    });
    elements.journey.addEventListener("click", (event) => {
      const station = event.target.closest("[data-task-id]");
      if (!station) return;
      selectedTaskId = station.dataset.taskId;
      selectedWorkerId = null;
      workerDetailState = "idle";
      renderActive();
    });
    elements.journey.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
      const stations = [...elements.journey.querySelectorAll("[data-task-id]")];
      const index = stations.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      stations[(index + delta + stations.length) % stations.length]?.focus();
    });
    elements.inspector.addEventListener("click", async (event) => {
      const attempt = event.target.closest("[data-worker-id]");
      if (attempt) return void selectWorker(attempt.dataset.workerId);
      const file = event.target.closest("[data-managed-file]");
      if (file) {
        try {
          const opened = await agenticApp.openManagedRunFile(activeRunId, file.dataset.managedFile);
          await onOpenManagedRunFile?.(opened, activeRunId);
        } catch (error) { setStatus("Error", error.message || "Unable to open Managed Run file"); }
        return;
      }
      if (event.target.closest(".inspector-copy-prompt")) {
        const detail = workerDetailCache.get(selectedWorkerId);
        if (detail?.prompt) { await agenticApp.writeClipboardText(detail.prompt); setStatus("Copied", "Exact worker prompt copied"); }
      }
      const retry = event.target.closest("[data-retry-task]");
      if (retry) void perform("Retrying", () => agenticApp.retryManagedRunTask(activeRunId, retry.dataset.retryTask));
    });
    elements.inspector.addEventListener("change", (event) => {
      const select = event.target.closest("[data-task-status]");
      if (!select) return;
      const task = activeRun()?.tasks?.find((candidate) => candidate.id === select.dataset.taskStatus);
      if (!task || select.value === task.status) return;
      if (!window.confirm(`Change ${task.id} from ${prettyStatus(task.status)} to ${prettyStatus(select.value)}? This will be recorded as a human override.`)) {
        renderInspectorSurface();
        return;
      }
      void perform("Task overridden", () => agenticApp.setManagedRunTaskStatus(activeRunId, task.id, select.value));
    });
    elements.generatePlan.addEventListener("click", () => perform("Planning", () => agenticApp.generateManagedRunPlan(activeRunId)));
    async function launchInteractive(role) {
      const run = activeRun(); if (!run) return;
      const routing = run.routing?.[role] || {};
      const result = await perform(role === "planner" ? "Shaping" : "Taking over", () => agenticApp.startSession({
        label: role === "planner" ? `Shape: ${run.title}` : `Take over: ${run.title}`,
        command: routing.provider || "codex", argsArray: routing.model ? ["--model", routing.model] : [], cwd: run.repoPath, cols: 120, rows: 36,
      }));
      if (result?.session) await onSessionStarted?.(result.session);
    }
    elements.shape.addEventListener("click", () => void launchInteractive("planner"));
    elements.takeover.addEventListener("click", () => void launchInteractive("implementer"));
    elements.planEditor.addEventListener("input", () => { elements.savePlan.disabled = !elements.planEditor.value.trim(); });
    elements.savePlan.addEventListener("click", () => perform("Saving", () => agenticApp.saveManagedRunPlan(activeRunId, markdownToPlan(elements.planEditor.value))));
    elements.approvePlan.addEventListener("click", () => perform("Approved", () => agenticApp.approveManagedRunPlan(activeRunId)));
    elements.start.addEventListener("click", () => perform("Running", () => agenticApp.startManagedRun(activeRunId)));
    elements.pause.addEventListener("click", () => perform("Paused", () => agenticApp.pauseManagedRun(activeRunId)));
    elements.cancel.addEventListener("click", () => perform("Cancelled", () => agenticApp.cancelManagedRun(activeRunId)));
    elements.accept.addEventListener("click", () => perform("Completed", () => agenticApp.acceptManagedRun(activeRunId)));
    elements.archive.addEventListener("click", async () => { const archived = await perform("Archived", () => agenticApp.archiveManagedRun(activeRunId)); if (archived) { runs.delete(activeRunId); hide(); } });
    elements.saveRouting.addEventListener("click", () => perform("Routing saved", () => agenticApp.updateManagedRunRouting(activeRunId, {
      planner: { provider: elements.routingProvider.value, model: elements.routingPlannerModel.value },
      implementer: { provider: elements.routingProvider.value, model: elements.routingImplementerModel.value },
      verifier: { provider: elements.routingProvider.value, model: elements.routingVerifierModel.value },
      integration_verifier: { provider: elements.routingProvider.value, model: elements.routingIntegrationModel.value },
    })));
    agenticApp.onManagedRunChanged((run) => { if (run?.id) upsert(run); });
    agenticApp.onManagedRunWorkerOutput((payload) => {
      if (!payload?.workerId) return;
      liveOutput.set(payload.workerId, `${liveOutput.get(payload.workerId) || ""}${payload.data || ""}`.slice(-1_000_000));
      const detail = workerDetailCache.get(payload.workerId);
      if (detail) detail.stdout = liveOutput.get(payload.workerId);
      if (payload.runId === activeRunId && payload.workerId === selectedWorkerId) renderInspectorSurface();
    });
  }

  async function initialize(defaultRepoPath = "") {
    elements.repoInput.value = defaultRepoPath;
    bind();
    const result = await agenticApp.listManagedRuns();
    for (const run of result?.runs || []) runs.set(run.id, run);
    renderTabs(); renderInboxSurface();
  }

  return {
    hide, initialize,
    isActive: () => Boolean(activeRunId) && !elements.view.classList.contains("hidden"),
    show,
  };
}

export { createManagedRunsView };
