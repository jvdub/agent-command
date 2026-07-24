import { agenticApp } from "./agenticApp.js";
import { markdownToPlan, planToMarkdown } from "./managedRunPlanMarkdown.js";
import { allAttentionItems, renderInbox } from "./managedRunInbox.js";
import { renderInspector } from "./managedRunInspector.js";
import { layoutJourney, renderJourney } from "./managedRunJourney.js";
import { currentAction, isNativeWorkflow, runProgress } from "./managedRunSelectors.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function prettyStatus(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function createManagedRunsView({ activateView, getActiveSessionId, getSessionsForRun, onOpenSession, onRestartSession, onSessionStarted, onOpenManagedRunFile, setStatus }) {
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
    specPanel: document.querySelector("#managed-run-spec-panel"),
    specMeta: document.querySelector("#managed-run-spec-meta"),
    specEditor: document.querySelector("#managed-run-spec-editor"),
    previousSpec: document.querySelector("#managed-run-previous-spec"),
    confirmTestSeams: document.querySelector("#managed-run-confirm-test-seams"),
    generateSpec: document.querySelector("#managed-run-generate-spec"),
    saveSpec: document.querySelector("#managed-run-save-spec"),
    approveSpec: document.querySelector("#managed-run-approve-spec"),
    ticketsPanel: document.querySelector("#managed-run-tickets-panel"),
    ticketsMeta: document.querySelector("#managed-run-tickets-meta"),
    ticketsEditor: document.querySelector("#managed-run-tickets-editor"),
    previousTickets: document.querySelector("#managed-run-previous-tickets"),
    generateTickets: document.querySelector("#managed-run-generate-tickets"),
    saveTickets: document.querySelector("#managed-run-save-tickets"),
    approveTickets: document.querySelector("#managed-run-approve-tickets"),
    ticketReconciliation: document.querySelector("#managed-run-ticket-reconciliation"),
    integrationLimits: document.querySelector("#managed-run-integration-limits"),
    integrationCycles: document.querySelector("#managed-run-integration-cycles"),
    integrationAttempts: document.querySelector("#managed-run-integration-attempts"),
    saveIntegrationLimits: document.querySelector("#managed-run-save-integration-limits"),
    shapePanel: document.querySelector("#managed-run-shape-panel"),
    shapeMeta: document.querySelector("#managed-run-shape-meta"),
    shapeEditor: document.querySelector("#managed-run-shape-editor"),
    saveShape: document.querySelector("#managed-run-save-shape"),
    approveShape: document.querySelector("#managed-run-approve-shape"),
    domainMeta: document.querySelector("#managed-run-domain-meta"),
    domainProposal: document.querySelector("#managed-run-domain-proposal"),
    createDomainDocs: document.querySelector("#managed-run-create-domain-docs"),
    saveDomainProposal: document.querySelector("#managed-run-save-domain-proposal"),
    refreshDomainDiff: document.querySelector("#managed-run-refresh-domain-diff"),
    domainDiff: document.querySelector("#managed-run-domain-diff"),
    planPanel: document.querySelector("#managed-run-plan-panel"),
    planEditor: document.querySelector("#managed-run-plan-editor"),
    journey: document.querySelector("#managed-run-journey"),
    journeyControls: document.querySelector(".journey-controls"),
    journeyZoom: document.querySelector("#managed-run-journey-zoom"),
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
    cleanup: document.querySelector("#managed-run-cleanup"),
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
  const journeyViews = new Map();
  let activeRunId = null;
  let selectedTaskId = null;
  let selectedWorkerId = null;
  let workerDetailState = "idle";
  let renderedPlanKey = "";
  let renderedShapeKey = "";
  let renderedSpecKey = "";
  let renderedTicketsKey = "";
  let renderedDomainKey = "";
  let acceptancePreviewKey = "";
  let journeyDrag = null;
  const collapsedRunIds = new Set();

  const activeRun = () => activeRunId ? runs.get(activeRunId) : null;

  function journeySignature(run) {
    return isNativeWorkflow(run)
      ? `workflow:${run.phase}:${(run.approvedTicketsSnapshot?.tickets || []).map((ticket) => `${ticket.id}:${ticket.dependencies.join(",")}`).join("|")}`
      : (run.tasks || []).map((task) => `${task.id}:${(task.dependencies || []).join(",")}`).join("|");
  }

  function applyJourneyView() {
    const canvas = elements.journey.querySelector(".journey-canvas");
    const state = activeRunId ? journeyViews.get(activeRunId) : null;
    if (!canvas || !state) return;
    canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    elements.journeyZoom.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function fitJourney() {
    const canvas = elements.journey.querySelector(".journey-canvas");
    if (!canvas || !activeRunId) return;
    const graphWidth = Number(canvas.dataset.graphWidth || canvas.offsetWidth || 1);
    const graphHeight = Number(canvas.dataset.graphHeight || canvas.offsetHeight || 1);
    const viewportWidth = elements.journey.clientWidth;
    const viewportHeight = elements.journey.clientHeight;
    if (!viewportWidth || !viewportHeight) return;
    const scale = Math.max(0.15, Math.min(1, (viewportWidth - 36) / graphWidth, (viewportHeight - 36) / graphHeight));
    journeyViews.set(activeRunId, {
      signature: journeySignature(activeRun()),
      manual: false,
      scale,
      x: (viewportWidth - graphWidth * scale) / 2,
      y: (viewportHeight - graphHeight * scale) / 2,
    });
    applyJourneyView();
  }

  function zoomJourney(factor, clientX = null, clientY = null) {
    if (!activeRunId) return;
    const current = journeyViews.get(activeRunId) || { scale: 1, x: 0, y: 0 };
    const rect = elements.journey.getBoundingClientRect();
    const anchorX = clientX === null ? rect.width / 2 : clientX - rect.left;
    const anchorY = clientY === null ? rect.height / 2 : clientY - rect.top;
    const scale = Math.min(1.6, Math.max(0.15, current.scale * factor));
    const ratio = scale / current.scale;
    journeyViews.set(activeRunId, {
      ...current,
      manual: true,
      scale,
      x: anchorX - (anchorX - current.x) * ratio,
      y: anchorY - (anchorY - current.y) * ratio,
    });
    applyJourneyView();
  }

  function renderJourneySurface(run) {
    const viewportWidth = elements.journey.clientWidth || 600;
    const viewportHeight = elements.journey.clientHeight || 500;
    const horizontal = layoutJourney(run, { direction: "horizontal" });
    const vertical = layoutJourney(run, { direction: "vertical" });
    const fitScale = (graph) => Math.min(1, (viewportWidth - 36) / graph.width, (viewportHeight - 36) / graph.height);
    const direction = fitScale(vertical) > fitScale(horizontal) ? "vertical" : "horizontal";
    const signature = `${journeySignature(run)}:${direction}`;
    const existing = journeyViews.get(run.id);
    elements.journey.innerHTML = renderJourney(run, selectedTaskId, { direction });
    requestAnimationFrame(() => {
      if (!existing || existing.signature !== signature) {
        fitJourney();
        const state = journeyViews.get(run.id);
        if (state) state.signature = signature;
      }
      else applyJourneyView();
    });
  }

  function renderTabs() {
    const list = [...runs.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    elements.tabs.innerHTML = list.length ? list.map((run) => {
      const childSessions = getSessionsForRun?.(run) || [];
      const expanded = childSessions.length > 0 && !collapsedRunIds.has(run.id);
      const children = expanded && childSessions.length ? `<div class="managed-run-session-list">${childSessions.map(({ session, role }) => `
        <button type="button" class="managed-run-session-tab ${session.id === getActiveSessionId?.() ? "active" : ""}" data-managed-session-id="${escapeHtml(session.id)}" data-managed-run-id="${escapeHtml(run.id)}" data-managed-session-action="${session.isRunning ? "open" : "restart"}">
          <span class="managed-run-session-dot ${session.isRunning ? "running" : "stopped"}"></span>
          <span><strong>${escapeHtml(session.label || (role === "planner" ? "Shape conversation" : "Managed session"))}</strong><small>${role === "planner" ? "Shape conversation" : "Managed session"} · ${session.isRunning ? "Running" : "Stopped · Click to restart"}</small></span>
        </button>`).join("")}</div>` : "";
      return `<div class="managed-run-nav-group ${run.id === activeRunId ? "active" : ""}"><div class="managed-run-tab-row">
        <button type="button" class="managed-run-expand" data-managed-run-expand="${escapeHtml(run.id)}" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(run.title)}" aria-expanded="${expanded}">${expanded ? "&#9662;" : "&#9656;"}</button>
        <button type="button" class="managed-run-tab" data-managed-run-id="${escapeHtml(run.id)}">
        <p class="managed-run-tab-title">${escapeHtml(run.title)}</p>
        <p class="managed-run-tab-meta">${escapeHtml(prettyStatus(run.status))} · ${runProgress(run).verified}/${runProgress(run).total} verified${childSessions.length ? ` · ${childSessions.length} session${childSessions.length === 1 ? "" : "s"}` : ""}</p>
        </button></div>${children}</div>`;
    }).join("") : '<p class="status-meta">No managed runs.</p>';
  }

  function renderInboxSurface() {
    const visibleRuns = [...runs.values()].filter((run) => !run.archived);
    elements.inboxList.innerHTML = renderInbox(visibleRuns, activeRunId);
    elements.inboxCount.textContent = String(allAttentionItems(visibleRuns).length);
  }

  function defaultSelection(run) {
    if (isNativeWorkflow(run)) {
      const selectable = [...(run.tasks || []), ...(run.integrationRepairs || [])];
      if (selectedTaskId && (["shape", "spec", "tickets", "implement", "accept", "mission-verification"].includes(selectedTaskId) || selectable.some((task) => task.id === selectedTaskId))) return;
      selectedTaskId = run.status === "final_verification" || run.finalVerification ? "mission-verification" : run.phase || "shape";
      return;
    }
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
    const displayPath = run.sourceRepoPath || run.repoPath;
    const base = run.baseRevision ? run.baseRevision.slice(0, 12) : "unknown base";
    const target = run.targetBranch || run.baseBranch || "unknown target";
    elements.viewMeta.textContent = `${prettyStatus(run.status)} · ${displayPath} · target ${target} @ ${base}`;
    elements.currentAction.textContent = currentAction(run);
    const progress = runProgress(run);
    elements.progress.textContent = `${progress.verified} of ${progress.total} tasks verified · ${progress.attempts} attempts · ${progress.retries} retries`;
    const shape = run.artifacts?.shape;
    const domain = shape?.domain;
    elements.domainMeta.textContent = domain?.hasConvention
      ? `Recognized: ${(domain.recognizedPaths || []).join(", ")}${domain.canonicalTerms?.length ? ` · canonical terms: ${domain.canonicalTerms.join(", ")}` : ""}`
      : "No project domain-document convention detected; proposals remain in the Run Workspace.";
    elements.domainDiff.textContent = domain?.diff || "No tracked domain-document changes.";
    const domainKey = `${run.id}:${domain?.fingerprint || "none"}:${domain?.proposalMarkdown || ""}`;
    if (domainKey !== renderedDomainKey && document.activeElement !== elements.domainProposal) {
      elements.domainProposal.value = domain?.proposalMarkdown || "";
      renderedDomainKey = domainKey;
    }
    elements.createDomainDocs.checked = Boolean(domain?.newConventionApproved);
    elements.createDomainDocs.hidden = Boolean(domain?.hasConvention);
    elements.createDomainDocs.closest("label").hidden = Boolean(domain?.hasConvention);
    elements.shapeMeta.textContent = shape?.summaryRevision
      ? `Summary r${shape.summaryRevision} · conversation r${shape.conversationRevision}${run.approvals?.shape ? " · approved" : " · approval required"}`
      : run.shapeSessionId ? "Conversation active · save a revision" : "Open Shape to begin";
    const shapeKey = `${run.id}:${shape?.summaryRevision || 0}`;
    if (shapeKey !== renderedShapeKey && document.activeElement !== elements.shapeEditor) {
      elements.shapeEditor.value = shape?.summaryMarkdown || `# Shape\n\n## Idea\n\n${run.specification || ""}\n\n## Decisions\n\n`;
      renderedShapeKey = shapeKey;
    }
    const spec = run.artifacts?.spec;
    elements.specMeta.textContent = spec?.revision
      ? `Revision ${spec.revision}${run.approvals?.spec?.revision === spec.revision ? " · approved" : spec.stale ? " · stale" : " · approval required"} · Shape r${spec.upstreamShapeRevision}`
      : run.status === "spec_generating" ? "Fresh read-only worker generating…" : "No Spec generated";
    const specKey = `${run.id}:${spec?.revision || 0}`;
    if (specKey !== renderedSpecKey && document.activeElement !== elements.specEditor) {
      elements.specEditor.value = spec?.markdown || "";
      renderedSpecKey = specKey;
      elements.confirmTestSeams.checked = Boolean(run.approvals?.spec?.revision === spec?.revision);
    }
    elements.previousSpec.textContent = spec?.previousApprovedMarkdown || "No previous approved revision.";
    const tickets = run.artifacts?.tickets;
    elements.ticketsMeta.textContent = tickets?.revision ? `Revision ${tickets.revision}${run.approvals?.tickets?.revision === tickets.revision ? " · approved" : tickets.stale ? " · stale" : " · approval required"} · Spec r${tickets.upstreamSpecRevision}` : run.status === "tickets_generating" ? "Fresh read-only worker generating…" : "No Tickets generated";
    const ticketsKey = `${run.id}:${tickets?.revision || 0}`;
    if (ticketsKey !== renderedTicketsKey && document.activeElement !== elements.ticketsEditor) { elements.ticketsEditor.value = tickets?.markdown || ""; renderedTicketsKey = ticketsKey; }
    elements.previousTickets.textContent = tickets?.previousRevisionMarkdown || tickets?.previousApprovedMarkdown || "No previous revision.";
    const reconciliation = run.revisionReconciliation;
    elements.ticketReconciliation.innerHTML = reconciliation?.entries?.length ? `<div class="managed-run-reconciliation"><h4>Preserved verified commits</h4>${reconciliation.entries.map((entry) => {
      const options = (run.artifacts?.tickets?.projection || []).map((ticket) => `<option value="${escapeHtml(ticket.id)}" ${entry.reversalTicketId === ticket.id ? "selected" : ""}>${escapeHtml(ticket.id)} — ${escapeHtml(ticket.title)}</option>`).join("");
      return `<div class="managed-run-reconciliation-entry"><p><strong>${escapeHtml(entry.ticketId)}</strong> · ${escapeHtml(entry.compatibility)} · commit ${escapeHtml(entry.commit?.revision?.slice(0, 12) || "recorded")}</p><button type="button" class="secondary" data-revision-retain="${escapeHtml(entry.ticketId)}">${entry.disposition === "retain" ? "Retained" : "Retain"}</button><select data-reversal-for="${escapeHtml(entry.ticketId)}"><option value="">Choose reversal Ticket</option>${options}</select><button type="button" class="secondary" data-revision-reverse="${escapeHtml(entry.ticketId)}">${entry.disposition === "reverse" ? "Reversal selected" : "Reverse with Ticket"}</button></div>`;
    }).join("")}</div>` : "";
    elements.planMeta.textContent = run.plan ? `Revision ${run.planRevision}${run.approvedRevision === run.planRevision ? " · approved" : " · approval required"}` : "No plan generated";
    if (!run.plan || run.approvedRevision !== run.planRevision) elements.planPanel.open = true;
    const planKey = `${run.id}:${run.planRevision}`;
    if (planKey !== renderedPlanKey && document.activeElement !== elements.planEditor) {
      elements.planEditor.value = planToMarkdown(run.plan);
      renderedPlanKey = planKey;
    }
    populateRouting(run);
    renderJourneySurface(run);
    renderInspectorSurface();
    renderInboxSurface();
    renderEvents(run);
    const usage = run.usage || {};
    elements.usage.textContent = `${usage.workerCount || 0} workers · ${usage.hasTokenData ? `${(usage.inputTokens || 0) + (usage.outputTokens || 0)} tokens` : "token data unavailable"}`;
    const active = Boolean(run.activeWorkerId) || ["planning", "spec_generating", "tickets_generating", "running", "final_verification"].includes(run.status);
    elements.generatePlan.disabled = active;
    elements.savePlan.disabled = active || !elements.planEditor.value.trim();
    elements.approvePlan.disabled = run.status !== "approval_required";
    elements.start.disabled = isNativeWorkflow(run)
      ? run.phase !== "implement" || !["implement_ready", "paused"].includes(run.status)
      : !["ready", "paused", "review_required"].includes(run.status) || run.finalVerification?.verdict === "pass";
    elements.start.textContent = isNativeWorkflow(run) ? (run.status === "paused" ? "Resume" : "Run next Ticket") : run.status === "ready" ? "Start" : "Resume";
    elements.pause.disabled = !["ready", "running", "final_verification"].includes(run.status);
    elements.cancel.disabled = ["cancelled", "completed", "failed"].includes(run.status);
    elements.accept.disabled = run.finalVerification?.verdict !== "pass" || !["review_required", "accept_confirmation_required", "integration_conflicts", "integration_blocked"].includes(run.status);
    elements.accept.textContent = isNativeWorkflow(run) ? "Accept & integrate locally" : "Accept";
    elements.archive.disabled = active;
    elements.shape.disabled = active;
    elements.saveShape.disabled = !run.shapeSessionId || !elements.shapeEditor.value.trim();
    elements.generateSpec.disabled = active || !run.approvals?.shape;
    elements.saveSpec.disabled = active || !run.approvals?.shape || !elements.specEditor.value.trim();
    elements.approveSpec.disabled = run.status !== "spec_approval_required";
    elements.generateTickets.disabled = active || !run.approvals?.spec;
    elements.saveTickets.disabled = active || !run.approvals?.spec || !elements.ticketsEditor.value.trim();
    elements.approveTickets.disabled = run.status !== "tickets_approval_required";
    elements.integrationLimits.hidden = !isNativeWorkflow(run) || !(run.integrationRepairs?.length || run.finalVerification?.verdict === "fix_required");
    elements.integrationCycles.value = run.integrationRepairCycleLimit || 2;
    elements.integrationAttempts.value = run.integrationRepairAttemptLimit || 3;
    elements.saveIntegrationLimits.disabled = active || run.status !== "paused";
    elements.approveShape.disabled = run.status !== "shape_approval_required";
    elements.takeover.disabled = active;
    const nativeWorkflow = isNativeWorkflow(run);
    elements.generatePlan.hidden = nativeWorkflow;
    elements.savePlan.hidden = nativeWorkflow;
    elements.approvePlan.hidden = nativeWorkflow;
    elements.start.hidden = nativeWorkflow && run.phase !== "implement";
    elements.pause.hidden = nativeWorkflow && run.phase !== "implement";
    elements.accept.hidden = nativeWorkflow && run.phase !== "accept";
    elements.takeover.hidden = nativeWorkflow && !["paused", "review_required"].includes(run.status);
    elements.planPanel.hidden = nativeWorkflow;
    elements.shapePanel.hidden = true;
    elements.specPanel.hidden = !nativeWorkflow;
    elements.ticketsPanel.hidden = !nativeWorkflow;
    elements.shape.hidden = !nativeWorkflow;
    elements.shape.textContent = nativeWorkflow ? (run.shapeSessionId ? "Open Shape Session" : "Start Shape Session") : "Shape Interactively";
    const previewKey = `${run.id}:${run.finalVerification?.verifiedCommit || "none"}`;
    if (nativeWorkflow && run.phase === "accept" && run.finalVerification?.verdict === "pass" && !run.integrationPreview && acceptancePreviewKey !== previewKey) {
      acceptancePreviewKey = previewKey;
      void perform("Integration preview", () => agenticApp.previewManagedRunAcceptance(run.id));
    }
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
      if (repository.sourceWasDirty) {
        const proceed = window.confirm(
          "This checkout has uncommitted changes. They will remain untouched and will not be included; the Managed Run starts from the selected committed base.",
        );
        if (!proceed) return;
      }
      if (!repository.isGitRepository) {
        initializeGit = window.confirm("This folder is not a Git repository. Initialize Git here and continue?");
        if (!initializeGit) return;
      }
      const run = await perform("Creating", () => agenticApp.createManagedRun({
        title: elements.titleInput.value, repoPath: elements.repoInput.value,
        idea: elements.specInput.value, provider: elements.providerInput.value,
        targetBranch: document.querySelector("#managed-run-target-branch")?.value || repository.targetBranch,
        baseRef: document.querySelector("#managed-run-base-ref")?.value || "HEAD",
        branchName: document.querySelector("#managed-run-branch-name")?.value || "",
        runWorkspacePath: document.querySelector("#managed-run-workspace-input")?.value || "",
        trackRunWorkspace: Boolean(document.querySelector("#managed-run-track-workspace")?.checked),
        cleanupRunWorkspace: Boolean(document.querySelector("#managed-run-cleanup-workspace")?.checked),
        cleanupWorktree: Boolean(document.querySelector("#managed-run-cleanup-worktree")?.checked),
        cleanupBranch: Boolean(document.querySelector("#managed-run-cleanup-branch")?.checked),
        planningModel: elements.planningModel.value, implementationModel: elements.implementationModel.value,
        verificationModel: elements.verificationModel.value, integrationModel: elements.integrationModel.value,
        initializeGit,
      }));
      if (run) { elements.popover.classList.add("hidden"); show(run.id); }
    });
    elements.tabs.addEventListener("click", (event) => {
      const session = event.target.closest("[data-managed-session-id]");
      if (session) {
        collapsedRunIds.delete(session.dataset.managedRunId);
        const action = session.dataset.managedSessionAction === "restart"
          ? onRestartSession
          : onOpenSession;
        void action?.(session.dataset.managedRunId, session.dataset.managedSessionId);
        return;
      }
      const expand = event.target.closest("[data-managed-run-expand]");
      if (expand) {
        const runId = expand.dataset.managedRunExpand;
        collapsedRunIds.has(runId) ? collapsedRunIds.delete(runId) : collapsedRunIds.add(runId);
        renderTabs(); return;
      }
      const tab = event.target.closest("[data-managed-run-id]");
      if (tab) { collapsedRunIds.delete(tab.dataset.managedRunId); show(tab.dataset.managedRunId); }
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
      if (selectedTaskId === "shape" && activeRun()?.shapeSessionId) {
        void perform("Refreshing Shape review", () => agenticApp.refreshManagedRunShapeReview(activeRunId));
      }
    });
    elements.journeyControls.addEventListener("click", (event) => {
      const action = event.target.closest("[data-journey-action]")?.dataset.journeyAction;
      if (action === "fit") fitJourney();
      if (action === "zoom-in") zoomJourney(1.2);
      if (action === "zoom-out") zoomJourney(1 / 1.2);
    });
    elements.journey.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomJourney(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    }, { passive: false });
    elements.journey.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("[data-task-id]")) return;
      const state = journeyViews.get(activeRunId);
      if (!state) return;
      state.manual = true;
      journeyDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: state.x, y: state.y };
      elements.journey.setPointerCapture(event.pointerId);
      elements.journey.classList.add("dragging");
    });
    elements.journey.addEventListener("pointermove", (event) => {
      if (!journeyDrag || journeyDrag.pointerId !== event.pointerId) return;
      const state = journeyViews.get(activeRunId);
      if (!state) return;
      state.x = journeyDrag.x + event.clientX - journeyDrag.startX;
      state.y = journeyDrag.y + event.clientY - journeyDrag.startY;
      applyJourneyView();
    });
    function finishJourneyDrag(event) {
      if (!journeyDrag || journeyDrag.pointerId !== event.pointerId) return;
      journeyDrag = null;
      elements.journey.classList.remove("dragging");
      if (elements.journey.hasPointerCapture(event.pointerId)) elements.journey.releasePointerCapture(event.pointerId);
    }
    elements.journey.addEventListener("pointerup", finishJourneyDrag);
    elements.journey.addEventListener("pointercancel", finishJourneyDrag);
    window.addEventListener("resize", () => {
      const state = activeRunId ? journeyViews.get(activeRunId) : null;
      if (state && !state.manual) requestAnimationFrame(() => renderJourneySurface(activeRun()));
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
      const managedSession = event.target.closest("[data-open-managed-session]");
      if (managedSession) {
        void onOpenSession?.(activeRunId, managedSession.dataset.openManagedSession);
        return;
      }
      const shapeAction = event.target.closest("[data-shape-action]")?.dataset.shapeAction;
      if (shapeAction === "refresh") return void perform("Refreshing Shape review", () => agenticApp.refreshManagedRunShapeReview(activeRunId));
      if (shapeAction === "save") {
        const summary = elements.inspector.querySelector("[data-shape-summary]")?.value || "";
        return void perform("Shape saved", () => agenticApp.saveManagedRunShape(activeRunId, summary));
      }
      if (shapeAction === "save-domain-proposal") {
        const proposal = elements.inspector.querySelector("[data-shape-domain-proposal]")?.value || "";
        return void perform("Domain proposal saved", () => agenticApp.saveManagedRunShapeDomainProposal(activeRunId, proposal));
      }
      if (shapeAction === "refresh-documentation") {
        const createProjectDocumentation = Boolean(elements.inspector.querySelector("[data-shape-create-domain-docs]")?.checked);
        return void perform("Documentation diff refreshed", () => agenticApp.refreshManagedRunShapeDocumentation(activeRunId, { createProjectDocumentation }));
      }
      if (shapeAction === "approve") {
        const createProjectDocumentation = Boolean(elements.inspector.querySelector("[data-shape-create-domain-docs]")?.checked);
        return void perform("Shape approved", () => agenticApp.approveManagedRunShape(activeRunId, { createProjectDocumentation }));
      }
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
      if (retry) return void perform("Retrying", () => agenticApp.retryManagedRunTask(activeRunId, retry.dataset.retryTask));
      const budget = event.target.closest("[data-save-ticket-budget]");
      if (budget) {
        const input = elements.inspector.querySelector(`[data-ticket-budget="${budget.dataset.saveTicketBudget}"]`);
        return void perform("Budget saved", () => agenticApp.updateManagedRunTicketBudget(activeRunId, budget.dataset.saveTicketBudget, Number(input?.value)));
      }
      const recovery = event.target.closest("[data-ticket-recovery]");
      if (recovery) {
        const action = recovery.dataset.ticketRecovery;
        const confirmed = action !== "restore_verified_base" || window.confirm("Discard the entire uncommitted failed change set and restore the previous verified Ticket Commit? This requires separate confirmation.");
        if (!confirmed) return;
        void perform("Ticket recovery", () => agenticApp.recoverManagedRunTicket(activeRunId, recovery.dataset.ticketId, action, confirmed)).then((result) => {
          if (result && action === "takeover") void launchInteractive("implementer");
        });
      }
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
    function shapePrompt(run) {
      const domain = run.artifacts?.shape?.domain;
      const domainPolicy = domain?.hasConvention
        ? `You may edit only these recognized domain documents: ${(domain.recognizedPaths || []).join(", ")}. Preserve these canonical terms: ${(domain.canonicalTerms || []).join(", ") || "none detected"}.`
        : `No domain-document convention exists. Do not create project files; propose domain material only in ${run.runWorkspacePath}/shape/domain-proposal.md until the user approves creation.`;
      return `You are the persistent Shape worker for this Managed Run. Research repository facts before relying on assumptions. Grill the idea by asking exactly one decision question at a time, waiting for the answer before the next. Seek a shared understanding of goals, constraints, non-goals, risks, and acceptance. Do not implement or commit. Keep the human-readable Shape summary current by editing ${run.runWorkspacePath}/shape/summary.md after each material decision; only the human may approve it. ${domainPolicy} Never edit application code during Shape.`;
    }
    async function launchInteractive(role) {
      const run = activeRun(); if (!run) return;
      const result = await perform(role === "planner" ? "Shaping" : "Taking over", () =>
        agenticApp.startManagedRunInteractiveSession(run.id, role));
      if (result?.session) {
        collapsedRunIds.delete(run.id);
        await onSessionStarted?.(result.session, { runId: run.id, role });
        if (role === "planner") {
          await agenticApp.writeToSession(result.session.id, `${shapePrompt(run)}\r`);
        }
      }
    }
    elements.shape.addEventListener("click", () => {
      const run = activeRun();
      if (!run) return;
      if (run.shapeSessionId) return void onOpenSession?.(run.id, run.shapeSessionId);
      void launchInteractive("planner");
    });
    elements.takeover.addEventListener("click", () => void launchInteractive("implementer"));
    elements.shapeEditor.addEventListener("input", () => { elements.saveShape.disabled = !activeRun()?.shapeSessionId || !elements.shapeEditor.value.trim(); });
    elements.specEditor.addEventListener("input", () => { elements.saveSpec.disabled = !elements.specEditor.value.trim(); });
    elements.generateSpec.addEventListener("click", () => perform("Generating Spec", () => agenticApp.generateManagedRunSpec(activeRunId)));
    elements.saveSpec.addEventListener("click", () => perform("Spec saved", () => agenticApp.saveManagedRunSpec(activeRunId, elements.specEditor.value)));
    elements.approveSpec.addEventListener("click", () => perform("Spec approved", () => agenticApp.approveManagedRunSpec(activeRunId, { testSeamsConfirmed: elements.confirmTestSeams.checked })));
    elements.ticketsEditor.addEventListener("input", () => { elements.saveTickets.disabled = !elements.ticketsEditor.value.trim(); });
    elements.generateTickets.addEventListener("click", () => perform("Generating Tickets", () => agenticApp.generateManagedRunTickets(activeRunId)));
    elements.saveTickets.addEventListener("click", () => perform("Tickets saved", () => agenticApp.saveManagedRunTickets(activeRunId, elements.ticketsEditor.value)));
    elements.approveTickets.addEventListener("click", () => perform("Tickets approved", () => agenticApp.approveManagedRunTickets(activeRunId)));
    elements.saveIntegrationLimits.addEventListener("click", () => perform("Repair limits saved", () => agenticApp.updateManagedRunIntegrationLimits(activeRunId, Number(elements.integrationCycles.value), Number(elements.integrationAttempts.value))));
    elements.ticketReconciliation.addEventListener("click", (event) => {
      const retain = event.target.closest("[data-revision-retain]");
      if (retain) void perform("Commit retained", () => agenticApp.decideManagedRunRevisionCommit(activeRunId, retain.dataset.revisionRetain, "retain"));
      const reverse = event.target.closest("[data-revision-reverse]");
      if (reverse) {
        const ticketId = reverse.dataset.revisionReverse;
        const reversalTicketId = elements.ticketReconciliation.querySelector(`[data-reversal-for="${CSS.escape(ticketId)}"]`)?.value;
        void perform("Reversal selected", () => agenticApp.decideManagedRunRevisionCommit(activeRunId, ticketId, "reverse", reversalTicketId));
      }
    });
    elements.saveShape.addEventListener("click", () => perform("Shape saved", () => agenticApp.saveManagedRunShape(activeRunId, elements.shapeEditor.value)));
    elements.saveDomainProposal.addEventListener("click", () => perform("Domain proposal saved", () => agenticApp.saveManagedRunShapeDomainProposal(activeRunId, elements.domainProposal.value)));
    elements.refreshDomainDiff.addEventListener("click", () => perform("Documentation diff refreshed", () => agenticApp.refreshManagedRunShapeDocumentation(activeRunId, { createProjectDocumentation: elements.createDomainDocs.checked })));
    elements.approveShape.addEventListener("click", () => perform("Shape approved", () => agenticApp.approveManagedRunShape(activeRunId, { createProjectDocumentation: elements.createDomainDocs.checked })));
    elements.planEditor.addEventListener("input", () => { elements.savePlan.disabled = !elements.planEditor.value.trim(); });
    elements.savePlan.addEventListener("click", () => perform("Saving", () => agenticApp.saveManagedRunPlan(activeRunId, markdownToPlan(elements.planEditor.value))));
    elements.approvePlan.addEventListener("click", () => perform("Approved", () => agenticApp.approveManagedRunPlan(activeRunId)));
    elements.start.addEventListener("click", () => perform("Running", () => agenticApp.startManagedRun(activeRunId)));
    elements.pause.addEventListener("click", () => perform("Paused", () => agenticApp.pauseManagedRun(activeRunId)));
    elements.cancel.addEventListener("click", () => perform("Cancelled", () => agenticApp.cancelManagedRun(activeRunId)));
    elements.accept.addEventListener("click", async () => {
      const run = activeRun();
      if (!isNativeWorkflow(run)) return perform("Completed", () => agenticApp.acceptManagedRun(activeRunId));
      const previewed = await perform("Integration preview", () => agenticApp.previewManagedRunAcceptance(activeRunId));
      if (!previewed) return;
      const preview = previewed.integrationPreview;
      let confirmMovedTarget = false;
      if (preview?.requiresConfirmation) confirmMovedTarget = window.confirm(`Target ${preview.targetBranch} moved from ${preview.baseRevision.slice(0, 12)} to ${preview.targetRevision.slice(0, 12)}. Create a normal local merge with ${preview.runRevision.slice(0, 12)}? Conflicts will be left for manual resolution.`);
      if (preview?.requiresConfirmation && !confirmMovedTarget) return;
      await perform("Accepted locally", () => agenticApp.acceptManagedRun(activeRunId, { confirmMovedTarget, previewToken: preview?.previewToken }));
    });
    elements.archive.addEventListener("click", async () => {
      const archived = await perform("Archived", () => agenticApp.archiveManagedRun(activeRunId));
      if (archived) upsert(archived);
    });
    elements.cleanup.addEventListener("click", async () => {
      const preview = await perform("Cleanup preview", () => agenticApp.previewManagedRunCleanup(activeRunId));
      if (!preview) return;
      const removals = preview.resources.filter((resource) => resource.action !== "retain");
      const retained = preview.resources.filter((resource) => resource.action === "retain");
      const resources = removals.map((resource) => resource.path || resource.ref).join("\n");
      const retainedNotice = retained.length ? "\n\nRetained:\n" + retained.map((resource) => resource.path || resource.ref).join("\n") : "";
      let confirmDestructiveCleanup = false;
      if (!preview.safeToClean) {
        confirmDestructiveCleanup = window.confirm("The run branch is not proven integrated. Remove only these clean recorded resources?\n\n" + resources + retainedNotice);
        if (!confirmDestructiveCleanup) return;
      } else if (!window.confirm("Remove these recorded local resources? Source checkout and target branch are retained.\n\n" + resources)) return;
      await perform("Cleaned", () => agenticApp.cleanupManagedRun(activeRunId, { previewToken: preview.previewToken, confirmDestructiveCleanup }));
    });
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
    const result = await agenticApp.listManagedRuns({ includeArchived: true });
    for (const run of result?.runs || []) runs.set(run.id, run);
    renderTabs(); renderInboxSurface();
  }

  return {
    hide, initialize,
    findRunForSession: (sessionId) => [...runs.values()].find((run) => run.shapeSessionId === sessionId)?.id || null,
    getRun: (runId) => runs.get(runId) || null,
    isActive: () => Boolean(activeRunId) && !elements.view.classList.contains("hidden"),
    refreshNavigation: renderTabs,
    show,
  };
}

export { createManagedRunsView };
