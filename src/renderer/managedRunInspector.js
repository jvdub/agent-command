import { taskDefinition, taskPhase } from "./managedRunSelectors.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function list(items, empty = "None") {
  return items?.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="status-meta">${empty}</p>`;
}

function workerFor(run, workerId) {
  return run?.workers?.find((worker) => worker.id === workerId) || null;
}

function renderAttempts(task, selectedWorkerId) {
  if (!task?.attempts?.length) return '<p class="status-meta">No attempts have started.</p>';
  return task.attempts.map((attempt) => {
    const workers = [
      { id: attempt.implementationWorkerId, label: `Attempt ${attempt.number} · implementation` },
      { id: attempt.verificationWorkerId, label: `Attempt ${attempt.number} · verification` },
    ].filter((entry) => entry.id);
    return `<div class="inspector-attempt-row">
      ${workers.map((entry) => `<button type="button" class="inspector-attempt ${entry.id === selectedWorkerId ? "active" : ""}" data-worker-id="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</button>`).join("")}
      ${attempt.verification?.verdict ? `<span class="managed-run-state">${escapeHtml(attempt.verification.verdict)}</span>` : ""}
    </div>`;
  }).join("");
}

function renderFiles(task, selectedAttempt) {
  const artifacts = selectedAttempt?.artifacts || null;
  const reported = artifacts?.reportedFiles || [];
  const observed = artifacts?.observedFiles || [];
  const renderFile = (file, provenance) => `<button type="button" class="inspector-file-link" data-managed-file="${escapeHtml(file)}"><span>${escapeHtml(file)}</span><small>${provenance}</small></button>`;
  return `
    <div class="inspector-evidence-group"><h4>Worker reported</h4>${reported.length ? reported.map((file) => renderFile(file, "reported")).join("") : '<p class="status-meta">No reported files.</p>'}</div>
    <div class="inspector-evidence-group"><h4>Git observed</h4>${observed.length ? observed.map((file) => renderFile(file, "working tree after attempt")).join("") : '<p class="status-meta">No observed files.</p>'}</div>
    ${artifacts?.parseStatus === "malformed" ? `<p class="field-help warning">Structured worker result unavailable: ${escapeHtml(artifacts.parseError)}</p>` : ""}`;
}

function renderInspector({ run, taskId, selectedWorkerId, workerDetail, workerDetailState = "idle" }) {
  if (!run || !taskId) return '<p class="managed-inspector-empty">Select a task to inspect its definition, prompts, attempts, and evidence.</p>';
  if (taskId === "final-verification") {
    const worker = run.workers?.find((candidate) => candidate.id === run.finalVerification?.workerId) ||
      [...(run.workers || [])].reverse().find((candidate) => candidate.role === "integration_verifier");
    return `<div class="inspector-heading"><p class="eyebrow">Goal Gate</p><h3>Integration verification</h3></div>
      <p class="managed-run-state">${escapeHtml(run.finalVerification?.verdict || run.status)}</p>
      <p>${escapeHtml(run.finalVerification?.summary || "Runs after every task has passed independent verification.")}</p>
      ${worker ? `<button type="button" class="inspector-attempt active" data-worker-id="${escapeHtml(worker.id)}">Inspect integration verifier prompt</button>` : ""}
      ${renderWorkerDetail(workerDetail, workerDetailState)}`;
  }
  const task = run.tasks?.find((candidate) => candidate.id === taskId);
  if (!task) return '<p class="managed-inspector-empty">The selected task is no longer available.</p>';
  const definition = taskDefinition(run, taskId) || task;
  const selectedAttempt = task.attempts?.find((attempt) =>
    [attempt.implementationWorkerId, attempt.verificationWorkerId].includes(selectedWorkerId),
  ) || task.attempts?.at(-1);
  const latestVerification = selectedAttempt?.verification;
  const canRetry = ["failed", "human_review_required", "replan_required"].includes(task.status);
  return `
    <div class="inspector-heading"><p class="eyebrow">Selected Task</p><h3>${escapeHtml(task.id)} · ${escapeHtml(task.title)}</h3><p class="managed-run-state">${escapeHtml(taskPhase(task))}</p></div>
    <details open data-inspector-section="overview"><summary>Overview</summary>
      <p>${escapeHtml(task.objective)}</p>
      <p class="status-meta">${task.attempts?.length || 0}/${task.maxAttempts} attempts · dependencies ${escapeHtml(task.dependencies?.join(", ") || "none")}</p>
      <label class="managed-run-task-override"><span>Human override</span><select data-task-status="${escapeHtml(task.id)}">
        ${["planned", "retry_required", "human_review_required", "succeeded", "cancelled", "failed"].map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${escapeHtml(status.replaceAll("_", " "))}</option>`).join("")}
      </select></label>
      ${canRetry ? `<button type="button" class="secondary inspector-retry-task" data-retry-task="${escapeHtml(task.id)}">Retry task</button>` : ""}
    </details>
    <details open data-inspector-section="approved-task"><summary>Approved task definition</summary>
      <p class="inspector-provenance">Approved revision ${escapeHtml(run.approvedPlanSnapshot?.revision || run.approvedRevision || "unapproved")} · ${escapeHtml(run.approvedPlanSnapshot?.provenance || "current plan")}</p>
      <h4>Objective</h4><p>${escapeHtml(definition.objective)}</p>
      <h4>Success criteria</h4>${list(definition.successCriteria)}
      <h4>Relevant scope</h4>${list(definition.relevantScope)}
      <h4>Context notes</h4>${list(definition.contextNotes)}
      <h4>Verification guidance</h4>${list(definition.verificationGuidance)}
    </details>
    <details open data-inspector-section="prompts"><summary>Prompts and attempts</summary>
      <div class="inspector-attempts">${renderAttempts(task, selectedWorkerId)}</div>
      ${renderWorkerDetail(workerDetail, workerDetailState)}
    </details>
    <details open data-inspector-section="evidence"><summary>Files and evidence</summary>
      ${renderFiles(task, selectedAttempt)}
      ${latestVerification ? `<h4>Verification verdict</h4><p class="managed-run-state">${escapeHtml(latestVerification.verdict)}</p><p>${escapeHtml(latestVerification.summary || latestVerification.feedback)}</p><h4>Checks</h4>${list(latestVerification.checks)}<h4>Failed criteria</h4>${list(latestVerification.failedCriteria)}<h4>Risks</h4>${list(latestVerification.risks)}` : '<p class="status-meta">No verification evidence yet.</p>'}
    </details>`;
}

function renderWorkerDetail(detail, state) {
  if (state === "loading") return '<p class="status-meta">Loading exact worker packet…</p>';
  if (state === "error") return '<p class="field-help warning">Worker detail could not be loaded.</p>';
  if (!detail) return '<p class="status-meta">Select an implementation or verification attempt to inspect the exact prompt sent.</p>';
  const prompt = detail.promptAvailability === "available" && detail.prompt
    ? `<pre class="inspector-prompt">${escapeHtml(detail.prompt)}</pre><button type="button" class="secondary inspector-copy-prompt">Copy prompt</button>`
    : '<p class="field-help warning">The exact prompt was not persisted because protected storage was unavailable.</p>';
  return `<div class="worker-packet">
    <p class="inspector-provenance">Prompt sent · ${escapeHtml(detail.promptKind)}${detail.attemptNumber ? ` · attempt ${detail.attemptNumber}` : ""} · template v${escapeHtml(detail.promptVersion)}</p>
    <p class="status-meta">${escapeHtml(detail.provider)} · ${escapeHtml(detail.model || detail.tier)} · ${escapeHtml(detail.commandPreview)}</p>
    ${prompt}
    <details><summary>Worker output</summary><pre class="managed-run-worker-output">${escapeHtml(detail.stdout || detail.stderr || "No output captured.")}</pre></details>
  </div>`;
}

export { renderInspector };
