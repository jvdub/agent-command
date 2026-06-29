import { agenticApp } from "./agenticApp.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function prettyStatus(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function createManagedRunsView({ activateView, onSessionStarted, setStatus }) {
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
    planMeta: document.querySelector("#managed-run-plan-meta"),
    planEditor: document.querySelector("#managed-run-plan-editor"),
    taskList: document.querySelector("#managed-run-task-list"),
    workerList: document.querySelector("#managed-run-worker-list"),
    workerOutput: document.querySelector("#managed-run-worker-output"),
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
  let activeRunId = null;
  let selectedWorkerId = null;
  let renderedPlanKey = "";

  function activeRun() {
    return activeRunId ? runs.get(activeRunId) : null;
  }

  function renderTabs() {
    const list = Array.from(runs.values()).sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
    if (!list.length) {
      elements.tabs.innerHTML = '<p class="status-meta">No managed runs.</p>';
      return;
    }
    elements.tabs.innerHTML = list
      .map(
        (run) => `
          <button type="button" class="managed-run-tab ${run.id === activeRunId ? "active" : ""}" data-managed-run-id="${escapeHtml(run.id)}">
            <p class="managed-run-tab-title">${escapeHtml(run.title)}</p>
            <p class="managed-run-tab-meta">${escapeHtml(prettyStatus(run.status))} · ${run.tasks?.filter((task) => task.status === "succeeded").length || 0}/${run.tasks?.length || 0} tasks</p>
          </button>`,
      )
      .join("");
  }

  function renderTasks(run) {
    if (!run.tasks?.length) {
      elements.taskList.innerHTML =
        '<p class="status-meta">No approved tasks yet.</p>';
      return;
    }
    elements.taskList.innerHTML = run.tasks
      .map((task) => {
        const latest = task.attempts?.at(-1)?.verification;
        const canRetry = [
          "failed",
          "human_review_required",
          "replan_required",
        ].includes(task.status);
        return `
          <article class="managed-run-task">
            <div class="managed-run-task-top">
              <h3>${escapeHtml(task.id)} · ${escapeHtml(task.title)}</h3>
              <span class="managed-run-state">${escapeHtml(prettyStatus(task.status))}</span>
            </div>
            <p class="managed-run-task-detail">${escapeHtml(task.objective)}</p>
            <p class="managed-run-task-detail">${task.attempts?.length || 0}/${task.maxAttempts} attempts · implementation ${escapeHtml(task.implementationTier)} · verification ${escapeHtml(task.verificationTier)}</p>
            ${latest ? `<p class="managed-run-task-detail">Latest verdict: ${escapeHtml(latest.verdict)}${latest.feedback ? ` — ${escapeHtml(latest.feedback)}` : ""}</p>` : ""}
            <label class="managed-run-task-override">
              <span>Human override</span>
              <select class="managed-run-task-status" data-task-id="${escapeHtml(task.id)}">
                ${["planned", "retry_required", "human_review_required", "succeeded", "cancelled", "failed"].map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${prettyStatus(status)}</option>`).join("")}
              </select>
            </label>
            ${canRetry ? `<div class="button-row"><button type="button" class="secondary managed-run-retry-task" data-task-id="${escapeHtml(task.id)}">Retry task</button></div>` : ""}
          </article>`;
      })
      .join("");
  }

  function workerText(worker) {
    const streamed = liveOutput.get(worker.id) || "";
    return [worker.stdout || streamed, worker.stderr ? `\n[stderr]\n${worker.stderr}` : ""]
      .filter(Boolean)
      .join("");
  }

  function renderWorkers(run) {
    if (!run.workers?.length) {
      elements.workerList.innerHTML = '<p class="status-meta">No workers yet.</p>';
      return;
    }
    elements.workerList.innerHTML = [...run.workers]
      .reverse()
      .map(
        (worker) => `
          <article class="managed-run-worker ${worker.id === selectedWorkerId ? "selected" : ""}" data-worker-id="${escapeHtml(worker.id)}" tabindex="0">
            <div class="managed-run-worker-top">
              <p><strong>${escapeHtml(prettyStatus(worker.role))}</strong>${worker.taskId ? ` · ${escapeHtml(worker.taskId)}` : ""}</p>
              <span class="managed-run-state">${escapeHtml(prettyStatus(worker.status))}</span>
            </div>
            <p class="managed-run-worker-detail">${escapeHtml(worker.provider)} · ${escapeHtml(worker.tier)}${worker.model ? ` · ${escapeHtml(worker.model)}` : " · provider default"}${worker.modelFlagUsed ? " · --model" : ""}</p>
            <p class="managed-run-worker-detail">${escapeHtml(worker.commandPreview)}</p>
          </article>`,
      )
      .join("");
    if (!selectedWorkerId && run.workers.length) {
      selectedWorkerId = run.workers.at(-1).id;
    }
    const selected = run.workers.find((worker) => worker.id === selectedWorkerId);
    if (selected) elements.workerOutput.textContent = workerText(selected) || "Waiting for output...";
  }

  function renderEvents(run) {
    elements.eventList.innerHTML = [...(run.events || [])]
      .reverse()
      .slice(0, 100)
      .map(
        (event) => `
          <article class="managed-run-event">
            <p><strong>${escapeHtml(event.message)}</strong></p>
            <p class="managed-run-event-detail">${escapeHtml(new Date(event.at).toLocaleString())} · ${escapeHtml(event.level)}</p>
          </article>`,
      )
      .join("");
  }

  function populateRouting(run) {
    const provider = run.routing?.implementer?.provider || "codex";
    if (document.activeElement !== elements.routingProvider) {
      elements.routingProvider.value = provider;
    }
    const pairs = [
      [elements.routingPlannerModel, run.routing?.planner?.model],
      [elements.routingImplementerModel, run.routing?.implementer?.model],
      [elements.routingVerifierModel, run.routing?.verifier?.model],
      [elements.routingIntegrationModel, run.routing?.integration_verifier?.model],
    ];
    for (const [element, value] of pairs) {
      if (document.activeElement !== element) element.value = value || "";
    }
  }

  function renderActive() {
    const run = activeRun();
    if (!run) return;
    elements.viewTitle.textContent = run.title;
    elements.viewMeta.textContent = `${prettyStatus(run.status)} · ${run.repoPath}`;
    elements.planMeta.textContent = run.plan
      ? `Revision ${run.planRevision}${run.approvedRevision === run.planRevision ? " · approved" : " · approval required"}`
      : "No plan generated";
    const planKey = `${run.id}:${run.planRevision}`;
    if (planKey !== renderedPlanKey && document.activeElement !== elements.planEditor) {
      elements.planEditor.value = run.plan ? JSON.stringify(run.plan, null, 2) : "";
      renderedPlanKey = planKey;
    }
    populateRouting(run);
    renderTasks(run);
    renderWorkers(run);
    renderEvents(run);
    const usage = run.usage || {};
    elements.usage.textContent = `${usage.workerCount || 0} workers · ${usage.premiumWorkerCount || 0} premium · ${usage.localInferenceCalls || 0} local decisions${usage.hasTokenData ? ` · ${(usage.inputTokens || 0) + (usage.outputTokens || 0)} known tokens` : " · token data unavailable"}`;

    const active = Boolean(run.activeWorkerId) || ["planning", "running", "final_verification"].includes(run.status);
    elements.generatePlan.disabled = active;
    elements.savePlan.disabled = active || !elements.planEditor.value.trim();
    elements.approvePlan.disabled = run.status !== "approval_required";
    elements.start.disabled =
      !["ready", "paused", "review_required"].includes(run.status) ||
      run.finalVerification?.verdict === "pass";
    elements.start.textContent = run.status === "ready" ? "Start" : "Resume";
    elements.pause.disabled = !["ready", "running", "final_verification"].includes(run.status);
    elements.cancel.disabled = ["cancelled", "completed", "failed"].includes(run.status);
    elements.accept.disabled = run.finalVerification?.verdict !== "pass" || run.status !== "review_required";
    elements.archive.disabled = active;
    elements.shape.disabled = active;
    elements.takeover.disabled = active;
  }

  function show(runId) {
    if (!runs.has(runId)) return;
    activeRunId = runId;
    selectedWorkerId = runs.get(runId).workers?.at(-1)?.id || null;
    activateView();
    elements.view.classList.remove("hidden");
    renderTabs();
    renderActive();
  }

  function hide() {
    elements.view.classList.add("hidden");
    activeRunId = null;
    renderTabs();
  }

  function upsert(run) {
    runs.set(run.id, run);
    renderTabs();
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

  function bind() {
    elements.newButton.addEventListener("click", () => {
      elements.popover.classList.toggle("hidden");
    });
    elements.pickDirectory.addEventListener("click", async () => {
      const selected = await agenticApp.pickDirectory();
      if (selected) elements.repoInput.value = selected;
    });
    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const run = await perform("Creating", () =>
        agenticApp.createManagedRun({
          title: elements.titleInput.value,
          repoPath: elements.repoInput.value,
          specification: elements.specInput.value,
          provider: elements.providerInput.value,
          planningModel: elements.planningModel.value,
          implementationModel: elements.implementationModel.value,
          verificationModel: elements.verificationModel.value,
          integrationModel: elements.integrationModel.value,
        }),
      );
      if (run) {
        elements.popover.classList.add("hidden");
        show(run.id);
      }
    });
    elements.tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-managed-run-id]");
      if (tab) show(tab.dataset.managedRunId);
    });
    elements.generatePlan.addEventListener("click", () =>
      perform("Planning", () => agenticApp.generateManagedRunPlan(activeRunId)),
    );
    async function launchInteractive(role) {
      const run = activeRun();
      if (!run) return;
      const routing = run.routing?.[role] || {};
      const argsArray = routing.model ? ["--model", routing.model] : [];
      const result = await perform(
        role === "planner" ? "Shaping" : "Taking over",
        () =>
          agenticApp.startSession({
            label:
              role === "planner"
                ? `Shape: ${run.title}`
                : `Take over: ${run.title}`,
            command: routing.provider || "codex",
            argsArray,
            cwd: run.repoPath,
            cols: 120,
            rows: 36,
          }),
      );
      if (result?.session) {
        await onSessionStarted?.(result.session);
        setStatus(
          role === "planner" ? "Shaping" : "Takeover",
          role === "planner"
            ? "Interactive planning session started; use /grill-me or your preferred shaping workflow."
            : "Interactive takeover session started in the Managed Run repository.",
        );
      }
    }
    elements.shape.addEventListener("click", () => void launchInteractive("planner"));
    elements.takeover.addEventListener("click", () =>
      void launchInteractive("implementer"),
    );
    elements.planEditor.addEventListener("input", () => {
      const run = activeRun();
      const active = Boolean(run?.activeWorkerId) ||
        ["planning", "running", "final_verification"].includes(run?.status);
      elements.savePlan.disabled = active || !elements.planEditor.value.trim();
    });
    elements.savePlan.addEventListener("click", () =>
      perform("Saving", () =>
        agenticApp.saveManagedRunPlan(activeRunId, JSON.parse(elements.planEditor.value)),
      ),
    );
    elements.approvePlan.addEventListener("click", () =>
      perform("Approved", () => agenticApp.approveManagedRunPlan(activeRunId)),
    );
    elements.start.addEventListener("click", () =>
      perform("Running", () => agenticApp.startManagedRun(activeRunId)),
    );
    elements.pause.addEventListener("click", () =>
      perform("Paused", () => agenticApp.pauseManagedRun(activeRunId)),
    );
    elements.cancel.addEventListener("click", () =>
      perform("Cancelled", () => agenticApp.cancelManagedRun(activeRunId)),
    );
    elements.accept.addEventListener("click", () =>
      perform("Completed", () => agenticApp.acceptManagedRun(activeRunId)),
    );
    elements.archive.addEventListener("click", async () => {
      const archived = await perform("Archived", () =>
        agenticApp.archiveManagedRun(activeRunId),
      );
      if (archived) {
        runs.delete(activeRunId);
        hide();
      }
    });
    elements.saveRouting.addEventListener("click", () => {
      const provider = elements.routingProvider.value;
      return perform("Routing saved", () =>
        agenticApp.updateManagedRunRouting(activeRunId, {
          planner: { provider, model: elements.routingPlannerModel.value },
          implementer: { provider, model: elements.routingImplementerModel.value },
          verifier: { provider, model: elements.routingVerifierModel.value },
          integration_verifier: { provider, model: elements.routingIntegrationModel.value },
        }),
      );
    });
    elements.taskList.addEventListener("click", (event) => {
      const button = event.target.closest(".managed-run-retry-task");
      if (button) {
        void perform("Retrying", () =>
          agenticApp.retryManagedRunTask(activeRunId, button.dataset.taskId),
        );
      }
    });
    elements.taskList.addEventListener("change", (event) => {
      const select = event.target.closest(".managed-run-task-status");
      if (!select) return;
      const run = activeRun();
      const task = run?.tasks?.find((candidate) => candidate.id === select.dataset.taskId);
      if (!task || select.value === task.status) return;
      const confirmed = window.confirm(
        `Change ${task.id} from ${prettyStatus(task.status)} to ${prettyStatus(select.value)}? This will be recorded as a human override.`,
      );
      if (!confirmed) {
        renderActive();
        return;
      }
      void perform("Task overridden", () =>
        agenticApp.setManagedRunTaskStatus(
          activeRunId,
          task.id,
          select.value,
        ),
      );
    });
    elements.workerList.addEventListener("click", (event) => {
      const workerElement = event.target.closest("[data-worker-id]");
      if (!workerElement) return;
      selectedWorkerId = workerElement.dataset.workerId;
      renderActive();
    });

    agenticApp.onManagedRunChanged((run) => {
      if (run?.id) upsert(run);
    });
    agenticApp.onManagedRunWorkerOutput((payload) => {
      if (!payload?.workerId) return;
      const current = liveOutput.get(payload.workerId) || "";
      liveOutput.set(payload.workerId, `${current}${payload.data || ""}`.slice(-1_000_000));
      if (payload.runId === activeRunId && payload.workerId === selectedWorkerId) {
        elements.workerOutput.textContent = liveOutput.get(payload.workerId);
        elements.workerOutput.scrollTop = elements.workerOutput.scrollHeight;
      }
    });
  }

  async function initialize(defaultRepoPath = "") {
    elements.repoInput.value = defaultRepoPath;
    bind();
    const result = await agenticApp.listManagedRuns();
    for (const run of result?.runs || []) runs.set(run.id, run);
    renderTabs();
  }

  return { hide, initialize, show };
}

export { createManagedRunsView };
