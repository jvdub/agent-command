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
  if (run.workflowKind === "native" && ["shape", "spec", "tickets", "implement", "accept"].includes(taskId)) {
    const shape = run.artifacts?.shape;
    const approval = run.approvals?.shape;
    const commit = approval?.documentationCommit;
    let evidence = "";
    if (taskId === "shape") evidence = `<details open data-inspector-section="evidence"><summary>Shape evidence</summary>
      <p class="inspector-provenance">Summary revision ${escapeHtml(shape?.summaryRevision || "unsaved")} · ${approval ? "approved" : "approval required"}</p>
      <h4>Domain documentation</h4>${list(shape?.domain?.changedPaths)}
      ${commit ? `<p class="managed-run-state">Committed ${escapeHtml(commit.revision.slice(0, 12))}</p><p>${escapeHtml(commit.message)}</p>${list(commit.paths)}` : '<p class="status-meta">No approved Shape documentation commit.</p>'}
      <details><summary>Reviewed documentation diff</summary><pre class="managed-run-worker-output">${escapeHtml(shape?.domain?.diff || "No tracked domain-document changes.")}</pre></details>
    </details>`;
    if (taskId === "spec") {
      const spec = run.artifacts?.spec;
      const specApproval = run.approvals?.spec;
      evidence = `<details open data-inspector-section="evidence"><summary>Spec evidence</summary>
        <p class="inspector-provenance">Revision ${escapeHtml(spec?.revision || "not generated")} · Shape revision ${escapeHtml(spec?.upstreamShapeRevision || "unknown")}</p>
        ${specApproval ? `<p class="managed-run-state">Approved ${escapeHtml(specApproval.approvedAt)}</p><p>Test seams explicitly confirmed</p>` : '<p class="status-meta">Current revision is not approved.</p>'}
      </details>`;
    }
    if (taskId === "accept") {
      const ticketCommits = (run.tasks || []).filter((task) => task.commit).map((task) => `${task.id} · ${task.commit.revision.slice(0, 12)} · ${task.commit.message}`);
      const repairCommits = (run.integrationRepairs || []).filter((task) => task.commit).map((task) => `${task.id} · ${task.commit.revision.slice(0, 12)} · ${task.commit.message}`);
      const preview = run.integration || run.integrationPreview;
      evidence = `<details open data-inspector-section="evidence"><summary>Final mission evidence</summary>
        <h4>Approved mission criteria</h4><pre class="managed-run-worker-output">${escapeHtml(run.artifacts?.spec?.markdown || run.specification)}</pre>
        <h4>Ticket Commits</h4>${list(ticketCommits)}<h4>Integration repair commits</h4>${list(repairCommits)}
        <h4>Mission checks</h4>${list(run.finalVerification?.checks)}<h4>Risks</h4>${list(run.finalVerification?.risks)}
        <h4>Target integration preview</h4><p class="managed-run-state">${escapeHtml(preview?.status || preview?.mode || "preview required")}</p>
        <p>${escapeHtml(run.targetBranch)} · target ${escapeHtml(preview?.targetRevision?.slice(0, 12) || "pending")} · run ${escapeHtml(preview?.runRevision?.slice(0, 12) || run.lastVerifiedCommit?.slice(0, 12) || "pending")}</p>
        ${preview?.conflictPaths?.length ? `<h4>Conflicts requiring human action</h4>${list(preview.conflictPaths)}<p class="inspector-provenance">${escapeHtml(preview.targetWorktreePath)}</p>` : ""}
        ${preview?.targetStatus?.length || preview?.operationMarkers?.length ? `<h4>Target worktree blockers</h4>${list([...(preview.targetStatus || []), ...(preview.operationMarkers || [])])}<p class="inspector-provenance">${escapeHtml(preview.targetWorktreePath)}</p>` : ""}
        ${run.approvals?.accept ? `<p class="managed-run-state">Accepted ${escapeHtml(run.approvals.accept.approvedAt)} · ${escapeHtml(run.integration?.resultingRevision?.slice(0, 12))}</p>` : ""}
      </details>`;
    }
    return `<div class="inspector-heading"><p class="eyebrow">Workflow Phase</p><h3>${escapeHtml(taskId[0].toUpperCase() + taskId.slice(1))}</h3></div>
      ${taskId === "shape" && run.shapeSessionId ? `<button type="button" class="secondary inspector-open-session" data-open-managed-session="${escapeHtml(run.shapeSessionId)}">Open session</button>` : ""}
      <p class="managed-run-state">${escapeHtml(taskId === run.phase ? run.status : approval ? "approved" : "locked")}</p>${evidence}`;
  }
  if (["final-verification", "mission-verification"].includes(taskId)) {
    const worker = run.workers?.find((candidate) => candidate.id === run.finalVerification?.workerId) ||
      [...(run.workers || [])].reverse().find((candidate) => candidate.role === "integration_verifier");
    return `<div class="inspector-heading"><p class="eyebrow">Goal Gate</p><h3>Integration verification</h3></div>
      <p class="managed-run-state">${escapeHtml(run.finalVerification?.verdict || run.status)}</p>
      <p>${escapeHtml(run.finalVerification?.summary || "Runs after every task has passed independent verification.")}</p>
      ${worker ? `<button type="button" class="inspector-attempt active" data-worker-id="${escapeHtml(worker.id)}">Inspect integration verifier prompt</button>` : ""}
      ${renderWorkerDetail(workerDetail, workerDetailState)}`;
  }
  const task = [...(run.tasks || []), ...(run.integrationRepairs || [])].find((candidate) => candidate.id === taskId);
  if (!task) return '<p class="managed-inspector-empty">The selected task is no longer available.</p>';
  const definition = taskDefinition(run, taskId) || task;
  const selectedAttempt = task.attempts?.find((attempt) =>
    [attempt.implementationWorkerId, attempt.verificationWorkerId].includes(selectedWorkerId),
  ) || task.attempts?.at(-1);
  const latestVerification = selectedAttempt?.verification;
  const canRetry = ["failed", "human_review_required", "replan_required"].includes(task.status);
  const recoveryStates = ["human_review_required", "external_edit_detected", "implementation_environment_blocked", "verification_environment_blocked", "verification_malformed"];
  const canRecover = run.workflowKind === "native" && recoveryStates.includes(task.status);
  return `
    <div class="inspector-heading"><p class="eyebrow">${run.workflowKind === "native" ? (task.id.startsWith("integration-repair-") ? "Integration Repair" : "Selected Ticket") : "Selected Task"}</p><h3>${escapeHtml(task.id)} · ${escapeHtml(task.title)}</h3><p class="managed-run-state">${escapeHtml(taskPhase(task))}</p></div>
    <details open data-inspector-section="overview"><summary>Overview</summary>
      <p>${escapeHtml(task.objective)}</p>
      <p class="status-meta">${task.attempts?.length || 0}/${task.maxAttempts} attempts · dependencies ${escapeHtml(task.dependencies?.join(", ") || "none")}</p>
      <label class="managed-run-task-override"><span>Human override</span><select data-task-status="${escapeHtml(task.id)}">
        ${["planned", "retry_required", "human_review_required", "succeeded", "cancelled", "failed"].map((status) => `<option value="${status}" ${status === task.status ? "selected" : ""}>${escapeHtml(status.replaceAll("_", " "))}</option>`).join("")}
      </select></label>
      ${canRetry ? `<button type="button" class="secondary inspector-retry-task" data-retry-task="${escapeHtml(task.id)}">Retry task</button>` : ""}
      ${run.workflowKind === "native" ? `<label><span>Attempt budget</span><input type="number" min="${(task.attempts?.length || 0) + 1}" max="10" value="${task.maxAttempts}" data-ticket-budget="${escapeHtml(task.id)}" /></label><button type="button" class="secondary" data-save-ticket-budget="${escapeHtml(task.id)}">Save budget</button>` : ""}
      ${canRecover ? `<div class="button-row"><button type="button" class="secondary" data-ticket-recovery="takeover" data-ticket-id="${escapeHtml(task.id)}">Manual takeover</button><button type="button" class="secondary" data-ticket-recovery="return_to_tickets" data-ticket-id="${escapeHtml(task.id)}">Return to Tickets</button><button type="button" class="danger" data-ticket-recovery="restore_verified_base" data-ticket-id="${escapeHtml(task.id)}">Restore verified commit…</button></div>` : ""}
    </details>
    <details open data-inspector-section="approved-task"><summary>Approved ${run.workflowKind === "native" ? "Ticket" : "task"} definition</summary>
      <p class="inspector-provenance">Approved revision ${escapeHtml(run.workflowKind === "native" ? run.approvedTicketsSnapshot?.revision || "unapproved" : run.approvedPlanSnapshot?.revision || run.approvedRevision || "unapproved")} · ${escapeHtml(run.workflowKind === "native" ? "frozen Ticket graph" : run.approvedPlanSnapshot?.provenance || "current plan")}</p>
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
      ${latestVerification ? `<h4>Verification verdict</h4><p class="managed-run-state">${escapeHtml(latestVerification.verdict)}</p><p>${escapeHtml(latestVerification.summary || latestVerification.feedback)}</p><h4>Spec assessment</h4><p class="managed-run-state">${escapeHtml(latestVerification.spec?.verdict || "missing")}</p>${list(latestVerification.spec?.findings)}<h4>Standards assessment</h4><p class="managed-run-state">${escapeHtml(latestVerification.standards?.verdict || "missing")}</p>${list(latestVerification.standards?.findings)}<h4>Reviewed diff</h4><p class="inspector-provenance">${escapeHtml(latestVerification.diffFingerprint || "not captured")}</p><h4>Checks</h4>${list(latestVerification.checks)}<h4>Failed criteria</h4>${list(latestVerification.failedCriteria)}<h4>Risks</h4>${list(latestVerification.risks)}${selectedAttempt?.commit ? `<h4>Ticket Commit</h4><p class="managed-run-state">${escapeHtml(selectedAttempt.commit.revision.slice(0, 12))}</p><p>${escapeHtml(selectedAttempt.commit.message)}</p>${list(selectedAttempt.commit.changedFiles)}` : ""}` : '<p class="status-meta">No verification evidence yet.</p>'}
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
