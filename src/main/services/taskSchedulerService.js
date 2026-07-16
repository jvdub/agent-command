const {
  RUN_TERMINAL_STATES,
  addRunEvent,
  extractStructuredJson,
  summarizeRun,
} = require("./managedRunUtils");

const SAFETY_RULES = `Safety rules:
- Stay inside the supplied repository.
- Preserve unrelated working-tree changes.
- Never commit, push, publish, open a pull request, or delete files.
- Do not claim a check passed unless you ran it and observed success.`;

const VERIFICATION_OUTCOME_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      enum: [
        "pass",
        "fix_required",
        "plan_defect",
        "spec_defect",
        "ticket_defect",
        "scope_change_required",
        "human_decision_required",
        "environment_blocked",
      ],
    },
    summary: { type: "string" },
    checks: { type: "array", items: { type: "string" } },
    failedCriteria: { type: "array", items: { type: "string" } },
    feedback: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    spec: { type: "object", properties: { verdict: { enum: ["pass", "fail"] }, findings: { type: "array", items: { type: "string" } } }, required: ["verdict", "findings"] },
    standards: { type: "object", properties: { verdict: { enum: ["pass", "fail"] }, findings: { type: "array", items: { type: "string" } } }, required: ["verdict", "findings"] },
  },
  required: [
    "verdict",
    "summary",
    "checks",
    "failedCriteria",
    "feedback",
    "risks",
    "spec",
    "standards",
  ],
  additionalProperties: true,
};

function missionContext(run) {
  if (run.workflowKind === "native") {
    return `Mission: ${run.specification}
Approved Spec revision: ${run.approvals.spec.revision}
Approved Spec:
${run.artifacts.spec.markdown}
Confirmed seams: ${run.artifacts.spec.markdown.match(/^## Testing Decisions[\s\S]*?(?=^## |$)/mu)?.[0] || "See approved Spec"}
Domain decisions: ${(run.artifacts.shape?.domain?.canonicalTerms || []).join("; ") || "Use recognized repository domain documents"}
Repository: ${run.worktreePath}`;
  }
  return `Mission: ${run.plan.objective}
Specification: ${run.specification}
Constraints: ${run.plan.constraints.join("; ") || "None supplied"}
Mission success criteria: ${run.plan.successCriteria.join("; ") || "Use the approved specification"}
Repository: ${run.repoPath}
Approved plan revision: ${run.approvedRevision}`;
}

function implementationPrompt(run, task, attemptNumber, feedback) {
  return `You are an implementation worker in an Agentic Command Managed Run. Complete exactly one bounded task. You do not manage other agents.

${missionContext(run)}

Task ID: ${task.id}
Task: ${task.title}
Objective: ${task.objective}
Success criteria: ${task.successCriteria.join("; ") || "Satisfy the task objective"}
Relevant scope: ${task.relevantScope.join("; ") || "Inspect and limit changes to the necessary scope"}
Context notes: ${task.contextNotes.join("; ") || "None"}
Test seams: ${(task.testSeams || []).join("; ") || "Use the approved Spec seams"}
TDD policy: ${task.tddPolicy || "test-first"}
TDD exception: ${task.tddException || "None"}
Repository state: clean at ${task.repositoryState?.headRevision || "validated base"}; branch ${run.branchName || "current Run branch"}; expected base ${run.lastVerifiedCommit || run.baseRevision || "approved base"}
Attempt: ${attemptNumber} of ${task.maxAttempts}
Latest verification feedback: ${feedback || "None; this is the first attempt"}

${SAFETY_RULES}

Inspect relevant files, implement the focused change, and run appropriate checks. End with exactly one JSON object:
{"summary":"what changed","changedFiles":["path"],"redEvidence":["failing check observed before implementation"],"greenEvidence":["passing check observed after implementation"],"alternativeVerificationEvidence":["approved exception evidence"],"checks":["command: result"],"risks":["remaining risk"]}`;
}

function verificationPrompt(run, task, implementationWorker) {
  return `You are an independent read-only verification worker in an Agentic Command Managed Run. Do not modify files.

${missionContext(run)}

Task ID: ${task.id}
Task: ${task.title}
Objective: ${task.objective}
Success criteria: ${task.successCriteria.join("; ") || "Satisfy the task objective"}
Verification guidance: ${task.verificationGuidance.join("; ") || "Inspect the diff and run focused checks"}
Implementation summary: ${implementationWorker.stdout.slice(-4000)}
Reviewed change-set fingerprint: ${task.attempts?.at(-1)?.reviewedDiff?.fingerprint || "captured immediately before verification"}

${SAFETY_RULES}

Inspect the current diff and relevant surrounding code. Run appropriate checks without editing. Use spec_defect when the approved behavior or acceptance rules are wrong, ticket_defect when decomposition or dependencies are wrong, plan_defect as the legacy Ticket-planning equivalent, and human_decision_required when the mission itself needs a human product decision. Return exactly one JSON object:
{"verdict":"pass|fix_required|spec_defect|ticket_defect|plan_defect|human_decision_required|environment_blocked","spec":{"verdict":"pass|fail","findings":["finding"]},"standards":{"verdict":"pass|fail","findings":["finding"]},"summary":"evidence-based result","checks":["command: result"],"failedCriteria":["criterion"],"feedback":"specific next action","risks":["remaining risk"],"recommendedTier":"economy|standard|premium|null"}`;
}

function integrationPrompt(run) {
  const tasks = run.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    attempts: task.attempts.length,
  }));
  return `You are the final independent read-only integration verifier for an Agentic Command Managed Run. Do not modify files.

${missionContext(run)}
Completed tasks: ${JSON.stringify(tasks)}
Final verification guidance: ${run.workflowKind === "native" ? "Verify the integrated approved Spec across every Ticket Commit" : run.plan.finalVerificationGuidance.join("; ") || "Verify the complete mission and full diff"}

${SAFETY_RULES}

Inspect the complete run branch, mission criteria, cross-Ticket interactions, scope, and repository Standards; run appropriate broader checks. Use scope_change_required when a repair would expand or change approved scope, and do not hide that change inside fix_required. Return exactly one JSON object:
{"verdict":"pass|fix_required|spec_defect|ticket_defect|plan_defect|scope_change_required|human_decision_required|environment_blocked","spec":{"verdict":"pass|fail","findings":["finding"]},"standards":{"verdict":"pass|fail","findings":["finding"]},"summary":"mission-wide result","checks":["command: result"],"failedCriteria":["criterion"],"feedback":"specific next action","risks":["remaining risk"]}`;
}

function createTaskSchedulerService({
  workerProviderRegistry,
  workerProcessService,
  managedRunPersistenceService,
  tokenLedgerService,
  localInferenceService,
  managedRunTicketExecutionService,
  publishRun,
}) {
  const activeLoops = new Set();

  function persistAndPublish(run) {
    run.updatedAt = new Date().toISOString();
    managedRunPersistenceService.save();
    publishRun(summarizeRun(run));
  }

  function updateUsage(run, worker) {
    tokenLedgerService.record(run.usage, worker);
  }

  function selectionFor(run, role, task = null) {
    const base = run.routing[role] || {};
    const tier = task
      ? role === "implementer"
        ? task.implementationTier
        : task.verificationTier
      : base.tier;
    return { ...base, tier: tier || "standard" };
  }

  async function launchWorker(run, role, task, prompt, attemptNumber = null) {
    const launch = workerProviderRegistry.buildLaunch({
      role,
      selection: selectionFor(run, role, task),
    });
    const environment = run.workflowKind === "native" && role === "implementer"
      ? await managedRunTicketExecutionService.workerEnvironment(run.runWorkspacePath)
      : {};
    const execution = workerProcessService.run({
      runId: run.id,
      taskId: task?.id || null,
      launch,
      prompt,
      cwd: run.workflowKind === "native" ? run.worktreePath : run.repoPath,
      environment,
    });
    const placeholder = {
      id: execution.workerId,
      runId: run.id,
      taskId: task?.id || null,
      role,
      provider: launch.provider,
      tier: launch.tier,
      model: launch.model,
      modelFlagUsed: launch.modelFlagUsed,
      permissionMode: launch.permissionMode,
      commandPreview: launch.preview,
      prompt,
      promptAvailability: "available",
      promptKind: role === "verifier"
        ? "task_verification"
        : role === "integration_verifier"
          ? "integration_verification"
          : role === "implementer"
            ? "implementation"
            : role,
      promptVersion: 1,
      promptCreatedAt: new Date().toISOString(),
      definitionRevision: run.approvedTicketsSnapshot?.revision || run.approvedRevision,
      attemptNumber,
      stdout: "",
      stderr: "",
      exitCode: null,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      usage: null,
      git: null,
    };
    run.workers.push(placeholder);
    run.activeWorkerId = placeholder.id;
    addRunEvent(
      run,
      `Starting ${role}${task ? ` for ${task.id}` : ""}: ${launch.preview}`,
      "info",
      { taskId: task?.id || null, attemptNumber, workerId: placeholder.id, phase: role },
    );
    persistAndPublish(run);

    const completed = await execution.completion;
    const index = run.workers.findIndex((worker) => worker.id === completed.id);
    const completedWorker = { ...placeholder, ...completed };
    if (index >= 0) run.workers[index] = completedWorker;
    run.activeWorkerId = null;
    updateUsage(run, completedWorker);
    addRunEvent(
      run,
      `${role}${task ? ` for ${task.id}` : ""} ${completed.status} (exit ${completed.exitCode}).`,
      completed.status === "succeeded" ? "info" : "error",
      { taskId: task?.id || null, attemptNumber, workerId: completedWorker.id, phase: role },
    );
    persistAndPublish(run);
    return completedWorker;
  }

  function nextExecutableTask(run) {
    for (const task of run.tasks) {
      if (!["planned", "retry_required"].includes(task.status)) continue;
      const dependenciesPassed = task.dependencies.every(
        (id) => run.tasks.find((candidate) => candidate.id === id)?.status === "succeeded",
      );
      if (dependenciesPassed) return task;
      if (task.status === "planned") task.status = "blocked_by_dependency";
    }
    for (const task of run.tasks) {
      if (task.status !== "blocked_by_dependency") continue;
      const dependenciesPassed = task.dependencies.every(
        (id) => run.tasks.find((candidate) => candidate.id === id)?.status === "succeeded",
      );
      if (dependenciesPassed) {
        task.status = "planned";
        return task;
      }
    }
    return null;
  }

  function stopForReview(run, message, level = "warning") {
    run.status = "review_required";
    addRunEvent(run, message, level);
    persistAndPublish(run);
  }

  async function resolveVerificationOutcome(run, worker, label) {
    try {
      return extractStructuredJson(worker.stdout);
    } catch (parseError) {
      if (!localInferenceService?.completeStructured) throw parseError;
      addRunEvent(
        run,
        `${label} output was malformed; the local model is attempting bounded classification.`,
        "warning",
      );
      run.usage.localInferenceCalls = (run.usage.localInferenceCalls || 0) + 1;
      persistAndPublish(run);
      return await localInferenceService.completeStructured({
        schema: VERIFICATION_OUTCOME_SCHEMA,
        prompt: `Classify this verification worker output. Do not solve the coding task. Return only the requested schema.\n\n${String(worker.stdout || worker.stderr).slice(-12000)}`,
      });
    }
  }

  async function prepareNativeAttempt(run, task) {
    try {
      if (task.attempts.length === 0) {
        task.repositoryState = await managedRunTicketExecutionService.assertCleanBase(
          run.worktreePath, run.lastVerifiedCommit || run.baseRevision,
        );
        return true;
      }
      const current = await managedRunTicketExecutionService.capture(run.worktreePath);
      const previous = task.attempts.at(-1)?.reviewedDiff;
      let expectedFingerprint = previous?.fingerprint;
      if (task.manualTakeover && previous) {
        task.takeoverBases ||= [];
        task.takeoverBases.push({ ...current, acceptedAt: new Date().toISOString(), provenance: "human_takeover" });
        expectedFingerprint = current.fingerprint;
        task.manualTakeover = false;
        addRunEvent(run, `${task.id} recorded the separately chosen manual-takeover diff as a new bounded attempt base.`, "warning", { humanOverride: true, taskId: task.id });
      }
      if (!previous || current.headRevision !== (run.lastVerifiedCommit || run.baseRevision) || current.refsFingerprint !== task.repositoryState?.refsFingerprint || current.fingerprint !== expectedFingerprint) {
        task.status = "external_edit_detected"; run.status = "paused";
        addRunEvent(run, `${task.id} paused because the failed change set changed outside its bounded retry.`, "warning");
        persistAndPublish(run); return false;
      }
      return true;
    } catch (error) {
      task.status = "external_edit_detected"; run.status = "paused";
      addRunEvent(run, `${task.id} paused before implementation: ${error.message}`, "warning");
      persistAndPublish(run); return false;
    }
  }

  async function executeTask(run, task) {
    if (run.workflowKind === "native" && !await prepareNativeAttempt(run, task)) return;
    const attemptNumber = task.attempts.length + 1;
    task.status = "implementing";
    run.status = "running";
    persistAndPublish(run);
    const feedback = task.attempts.at(-1)?.verification?.feedback || "";
    const implementation = await launchWorker(
      run,
      "implementer",
      task,
      implementationPrompt(run, task, attemptNumber, feedback),
      attemptNumber,
    );
    const attempt = {
      number: attemptNumber,
      implementationWorkerId: implementation.id,
      verificationWorkerId: null,
      verification: null,
      startedAt: implementation.startedAt,
      finishedAt: null,
      definitionRevision: run.approvedTicketsSnapshot?.revision || run.approvedRevision,
      artifacts: null,
      reviewedDiff: null,
      commit: null,
    };
    task.attempts.push(attempt);

    if (implementation.status !== "succeeded") {
      attempt.finishedAt = implementation.finishedAt;
      if (run.workflowKind === "native" && implementation.status !== "cancelled") {
        task.status = "implementation_environment_blocked";
        attempt.verification = { verdict: "environment_blocked", summary: "Implementation worker did not exit successfully.", feedback: implementation.stderr.slice(-2000) || `Exit code ${implementation.exitCode}`, checks: [], failedCriteria: [], risks: [] };
        attempt.evidencePath = await managedRunTicketExecutionService.writeEvidence(run.runWorkspacePath, task, attempt);
        stopForReview(run, `${task.id} stopped at implementation: ${attempt.verification.feedback}`);
        return;
      }
      if (attemptNumber < task.maxAttempts && implementation.status !== "cancelled") {
        task.status = "retry_required";
        attempt.verification = {
          verdict: "environment_blocked",
          summary: "Implementation worker did not exit successfully.",
          feedback: implementation.stderr.slice(-2000) || `Exit code ${implementation.exitCode}`,
          checks: [],
          failedCriteria: [],
          risks: [],
        };
        addRunEvent(run, `${task.id} implementation failed; a bounded retry is queued.`, "warning");
        persistAndPublish(run);
        return;
      }
      task.status = implementation.status === "cancelled" ? "cancelled" : "failed";
      if (implementation.status === "cancelled" || run.status === "cancelled") {
        persistAndPublish(run);
        return;
      }
      stopForReview(run, `${task.id} implementation could not complete.`);
      return;
    }

    try {
      const reported = extractStructuredJson(implementation.stdout);
      const safeFiles = Array.isArray(reported.changedFiles)
        ? reported.changedFiles.map((value) => String(value || "").trim().replace(/\\/g, "/"))
          .filter((value) => value && !value.startsWith("/") && !/^[A-Za-z]:\//u.test(value) && !value.split("/").includes(".."))
        : [];
      attempt.artifacts = {
        parseStatus: "parsed",
        summary: String(reported.summary || ""),
        reportedFiles: safeFiles,
        observedFiles: [...(implementation.git?.changedFiles || [])],
        checks: Array.isArray(reported.checks) ? reported.checks.map(String) : [],
        risks: Array.isArray(reported.risks) ? reported.risks.map(String) : [],
        redEvidence: Array.isArray(reported.redEvidence) ? reported.redEvidence.map(String) : [],
        greenEvidence: Array.isArray(reported.greenEvidence) ? reported.greenEvidence.map(String) : [],
        alternativeVerificationEvidence: Array.isArray(reported.alternativeVerificationEvidence) ? reported.alternativeVerificationEvidence.map(String) : [],
        observedAttribution: "working-tree-after",
      };
      implementation.artifacts = attempt.artifacts;
    } catch (error) {
      attempt.artifacts = {
        parseStatus: "malformed",
        parseError: error.message,
        summary: "",
        reportedFiles: [],
        observedFiles: [...(implementation.git?.changedFiles || [])],
        checks: [],
        risks: [],
        redEvidence: [],
        greenEvidence: [],
        alternativeVerificationEvidence: [],
        observedAttribution: "working-tree-after",
      };
      implementation.artifacts = attempt.artifacts;
    }

    if (run.workflowKind === "native") {
      const evidence = attempt.artifacts;
      const validTddEvidence = task.tddPolicy === "exception"
        ? evidence.alternativeVerificationEvidence.length > 0
        : evidence.redEvidence.length > 0 && evidence.greenEvidence.length > 0;
      if (!validTddEvidence) {
        task.status = "human_review_required";
        stopForReview(run, `${task.id} did not report the required TDD or approved exception evidence.`);
        return;
      }
      attempt.reviewedDiff = await managedRunTicketExecutionService.capture(run.worktreePath);
      if (attempt.reviewedDiff.headRevision !== (run.lastVerifiedCommit || run.baseRevision) || attempt.reviewedDiff.refsFingerprint !== task.repositoryState.refsFingerprint) {
        task.status = "human_review_required";
        stopForReview(run, `${task.id} implementation worker changed Git history or refs; only Agentic Command may create Ticket Commits.`);
        return;
      }
    }
    task.status = "awaiting_verification";
    persistAndPublish(run);
    task.status = "verifying";
    let verification = await launchWorker(
      run,
      "verifier",
      task,
      verificationPrompt(run, task, implementation),
      attemptNumber,
    );
    attempt.verificationWorkerId = verification.id;
    attempt.finishedAt = verification.finishedAt;
    if (verification.status !== "succeeded") {
      if (verification.status === "cancelled" || run.status === "cancelled") {
        task.status = "cancelled";
        persistAndPublish(run);
        return;
      }
      task.status = run.workflowKind === "native" ? "verification_environment_blocked" : "human_review_required";
      stopForReview(run, `${task.id} verifier failed to produce usable evidence.`);
      return;
    }

    let outcome;
    try {
      outcome = await resolveVerificationOutcome(
        run,
        verification,
        `${task.id} verifier`,
      );
    } catch (error) {
      task.status = run.workflowKind === "native" ? "verification_malformed" : "human_review_required";
      stopForReview(run, `${task.id} verifier output was malformed: ${error.message}`);
      return;
    }
    const allowed = new Set([
      "pass",
      "fix_required",
      "plan_defect",
      "spec_defect",
      "ticket_defect",
      "human_decision_required",
      "environment_blocked",
    ]);
    if (!allowed.has(outcome.verdict)) {
      task.status = "human_review_required";
      stopForReview(run, `${task.id} verifier returned an invalid verdict.`);
      return;
    }
    attempt.verification = {
      verdict: outcome.verdict,
      summary: String(outcome.summary || ""),
      feedback: String(outcome.feedback || ""),
      checks: Array.isArray(outcome.checks) ? outcome.checks : [],
      failedCriteria: Array.isArray(outcome.failedCriteria)
        ? outcome.failedCriteria
        : [],
      risks: Array.isArray(outcome.risks) ? outcome.risks : [],
      recommendedTier: outcome.recommendedTier || null,
      spec: outcome.spec || { verdict: "fail", findings: ["Verifier omitted Spec assessment."] },
      standards: outcome.standards || { verdict: "fail", findings: ["Verifier omitted Standards assessment."] },
      diffFingerprint: attempt.reviewedDiff?.fingerprint || null,
    };

    if (run.workflowKind === "native" && outcome.verdict !== "pass") {
      attempt.evidencePath = await managedRunTicketExecutionService.writeEvidence(
        run.runWorkspacePath, task, attempt,
      );
    }

    if (outcome.verdict === "pass") {
      if (run.workflowKind === "native" && (attempt.verification.spec.verdict !== "pass" || attempt.verification.standards.verdict !== "pass")) {
        task.status = "human_review_required";
        stopForReview(run, `${task.id} verifier did not pass both Spec and Standards axes.`);
        return;
      }
      if (run.workflowKind === "native") {
        const current = await managedRunTicketExecutionService.capture(run.worktreePath);
        if (current.fingerprint !== attempt.reviewedDiff.fingerprint) {
          attempt.reviewedDiff = current;
          addRunEvent(run, `${task.id} changed after verification; starting one fresh reverification.`, "warning");
          persistAndPublish(run);
          verification = await launchWorker(
            run, "verifier", task, verificationPrompt(run, task, implementation), attemptNumber,
          );
          attempt.verificationWorkerId = verification.id;
          attempt.finishedAt = verification.finishedAt;
          if (verification.status !== "succeeded") {
            task.status = "human_review_required";
            stopForReview(run, `${task.id} reverifier failed to produce usable evidence.`);
            return;
          }
          outcome = await resolveVerificationOutcome(run, verification, `${task.id} reverifier`);
          attempt.verification = {
            verdict: outcome.verdict, summary: String(outcome.summary || ""), feedback: String(outcome.feedback || ""),
            checks: Array.isArray(outcome.checks) ? outcome.checks : [], failedCriteria: Array.isArray(outcome.failedCriteria) ? outcome.failedCriteria : [],
            risks: Array.isArray(outcome.risks) ? outcome.risks : [], recommendedTier: outcome.recommendedTier || null,
            spec: outcome.spec || { verdict: "fail", findings: ["Verifier omitted Spec assessment."] },
            standards: outcome.standards || { verdict: "fail", findings: ["Verifier omitted Standards assessment."] },
            diffFingerprint: attempt.reviewedDiff.fingerprint,
          };
          const reverified = await managedRunTicketExecutionService.capture(run.worktreePath);
          if (outcome.verdict !== "pass" || attempt.verification.spec.verdict !== "pass" || attempt.verification.standards.verdict !== "pass" || reverified.fingerprint !== attempt.reviewedDiff.fingerprint) {
            task.status = "human_review_required";
            stopForReview(run, `${task.id} could not bind a passing reverification to an unchanged diff.`);
            return;
          }
        }
        attempt.commit = await managedRunTicketExecutionService.commitReviewed(
          run.worktreePath, attempt.reviewedDiff.fingerprint, task,
        );
        task.commit = attempt.commit;
        run.lastVerifiedCommit = attempt.commit.revision;
        attempt.evidencePath = await managedRunTicketExecutionService.writeEvidence(
          run.runWorkspacePath, task, attempt,
        );
      }
      task.status = "succeeded";
      addRunEvent(run, `${task.id} passed independent verification${attempt.commit ? ` and committed as ${attempt.commit.revision.slice(0, 12)}` : ""}.`, "info", {
        taskId: task.id,
        attemptNumber,
        workerId: verification.id,
        phase: "verification",
        verdict: "pass",
      });
      persistAndPublish(run);
      return;
    }
    if (outcome.verdict === "fix_required" && attemptNumber < task.maxAttempts) {
      task.status = "retry_required";
      addRunEvent(run, `${task.id} requires another implementation attempt.`, "warning", {
        taskId: task.id,
        attemptNumber,
        workerId: verification.id,
        phase: "verification",
        verdict: "fix_required",
      });
      persistAndPublish(run);
      return;
    }
    if (["plan_defect", "spec_defect", "ticket_defect", "human_decision_required"].includes(outcome.verdict)) {
      const targetPhase = outcome.verdict === "human_decision_required"
        ? "shape"
        : outcome.verdict === "spec_defect" ? "spec" : "tickets";
      task.status = "revision_required";
      run.phase = targetPhase;
      run.status = `${targetPhase}_revision_required`;
      run.revisionRequest = {
        targetPhase,
        verdict: outcome.verdict,
        taskId: task.id,
        reason: String(outcome.feedback || outcome.summary || "Upstream revision required."),
        requestedAt: new Date().toISOString(),
      };
      addRunEvent(run, `${task.id} requires returning to ${targetPhase}.`, "warning", {
        taskId: task.id, attemptNumber, workerId: verification.id,
        phase: "verification", verdict: outcome.verdict, targetPhase,
      });
      persistAndPublish(run);
      return;
    }
    task.status = "human_review_required";
    stopForReview(
      run,
      attemptNumber >= task.maxAttempts
        ? `${task.id} exhausted its implementation attempts.`
        : `${task.id} requires human review: ${outcome.verdict}.`,
    );
  }

  function routeIntegrationRevision(run, outcome) {
    const targetPhase = ["human_decision_required", "scope_change_required"].includes(outcome.verdict)
      ? "shape"
      : outcome.verdict === "spec_defect" ? "spec" : "tickets";
    run.phase = targetPhase;
    run.status = `${targetPhase}_revision_required`;
    run.revisionRequest = {
      targetPhase, verdict: outcome.verdict, taskId: null,
      reason: String(outcome.feedback || outcome.summary || "Upstream revision required."),
      requestedAt: new Date().toISOString(), source: "integration_verification",
    };
    addRunEvent(run, `Mission verification requires returning to ${targetPhase}.`, "warning", { phase: "integration_verification", verdict: outcome.verdict, targetPhase });
    persistAndPublish(run);
  }

  function createIntegrationRepair(run, outcome) {
    run.integrationRepairs ||= [];
    const cycle = run.integrationRepairs.length + 1;
    return {
      id: `integration-repair-${cycle}`, title: `Repair integrated mission (cycle ${cycle})`, cycle,
      objective: String(outcome.feedback || "Repair the bounded in-scope integration failure."),
      successCriteria: Array.isArray(outcome.failedCriteria) && outcome.failedCriteria.length ? outcome.failedCriteria : ["Mission-wide verification passes"],
      dependencies: [], relevantScope: [], contextNotes: [String(outcome.summary || "Integration verification failed.")],
      verificationGuidance: Array.isArray(outcome.checks) ? outcome.checks : [], testSeams: ["mission-wide integration verification"],
      tddPolicy: "test-first", tddException: "None", implementationTier: outcome.recommendedTier || "standard",
      verificationTier: "premium", maxAttempts: run.integrationRepairAttemptLimit || 3, status: "planned", attempts: [],
      sourceVerificationWorkerId: run.finalVerification?.workerId || null,
    };
  }

  async function executeFinalVerification(run) {
    run.integrationRepairCycleLimit ||= 2;
    run.integrationRepairAttemptLimit ||= 3;
    while (true) {
      run.status = "final_verification";
      let integrationBoundary = null;
      if (run.workflowKind === "native") integrationBoundary = await managedRunTicketExecutionService.assertCleanBase(run.worktreePath, run.lastVerifiedCommit || run.baseRevision);
      persistAndPublish(run);
      const worker = await launchWorker(run, "integration_verifier", null, integrationPrompt(run), null);
      if (worker.status !== "succeeded") {
        stopForReview(run, "Final integration verifier failed to complete.");
        return;
      }
      if (run.workflowKind === "native") {
        const afterVerification = await managedRunTicketExecutionService.capture(run.worktreePath);
        if (afterVerification.headRevision !== integrationBoundary.headRevision || afterVerification.refsFingerprint !== integrationBoundary.refsFingerprint || afterVerification.fingerprint !== integrationBoundary.fingerprint) {
          stopForReview(run, "Final integration verifier changed the verified branch or worktree.");
          return;
        }
      }
      let outcome;
      try {
        outcome = await resolveVerificationOutcome(run, worker, "Final verifier");
      } catch (error) {
        stopForReview(run, `Final verifier output was malformed: ${error.message}`);
        return;
      }
      run.finalVerification = {
        workerId: worker.id, verdict: outcome.verdict, summary: String(outcome.summary || ""),
        checks: Array.isArray(outcome.checks) ? outcome.checks : [], failedCriteria: Array.isArray(outcome.failedCriteria) ? outcome.failedCriteria : [],
        feedback: String(outcome.feedback || ""), risks: Array.isArray(outcome.risks) ? outcome.risks : [],
        spec: outcome.spec || { verdict: "fail", findings: ["Verifier omitted Spec assessment."] },
        standards: outcome.standards || { verdict: "fail", findings: ["Verifier omitted Standards assessment."] },
        verifiedCommit: run.lastVerifiedCommit || null, repositoryState: integrationBoundary,
        verifiedAt: new Date().toISOString(),
      };
      persistAndPublish(run);
      if (run.pauseRequested) {
        run.pauseRequested = false; run.status = "paused";
        addRunEvent(run, "Paused after the active mission verifier finished; no repair worker was started.");
        persistAndPublish(run); return;
      }
      if (outcome.verdict === "pass") {
        if (run.workflowKind === "native" && (run.finalVerification.spec.verdict !== "pass" || run.finalVerification.standards.verdict !== "pass")) {
          stopForReview(run, "Final integration verifier did not pass both Spec and Standards axes.");
          return;
        }
        run.phase = run.workflowKind === "native" ? "accept" : run.phase;
        stopForReview(run, "Final integration verification passed; human acceptance is required.", "info");
        return;
      }
      if (["plan_defect", "spec_defect", "ticket_defect", "scope_change_required", "human_decision_required"].includes(outcome.verdict)) {
        routeIntegrationRevision(run, outcome);
        return;
      }
      if (outcome.verdict !== "fix_required") {
        stopForReview(run, `Final integration verification returned ${outcome.verdict}.`);
        return;
      }
      if ((run.integrationRepairs?.length || 0) >= run.integrationRepairCycleLimit) {
        run.status = "paused";
        addRunEvent(run, "Integration repair cycle limit reached; adjust limits or revise upstream artifacts.", "warning");
        persistAndPublish(run);
        return;
      }
      const repair = createIntegrationRepair(run, outcome);
      run.integrationRepairs.push(repair);
      addRunEvent(run, `${repair.id} created from fixable mission-wide verification feedback.`, "warning");
      persistAndPublish(run);
      while (["planned", "retry_required"].includes(repair.status)) await executeTask(run, repair);
      if (repair.status !== "succeeded") {
        if (repair.attempts.length >= repair.maxAttempts) {
          run.status = "paused";
          addRunEvent(run, `${repair.id} exhausted its attempt limit; adjust repair limits while paused or revise upstream artifacts.`, "warning");
          persistAndPublish(run);
        }
        return;
      }
      if (run.pauseRequested) {
        run.pauseRequested = false; run.status = "paused";
        addRunEvent(run, "Paused after the active integration repair finished; no new mission verifier was started.");
        persistAndPublish(run); return;
      }
    }
  }

  async function autoRun(run) {
    if (activeLoops.has(run.id)) return;
    activeLoops.add(run.id);
    try {
      while (!RUN_TERMINAL_STATES.has(run.status)) {
        const pendingRepair = run.workflowKind === "native" ? run.integrationRepairs?.at(-1) : null;
        if (pendingRepair && ["planned", "retry_required"].includes(pendingRepair.status)) {
          await executeTask(run, pendingRepair);
          if (run.pauseRequested) {
            run.pauseRequested = false; run.status = "paused"; persistAndPublish(run); break;
          }
          if (pendingRepair.status !== "succeeded") break;
          continue;
        }
        const task = nextExecutableTask(run);
        if (task) {
          await executeTask(run, task);
          if (run.pauseRequested) {
            run.pauseRequested = false; run.status = "paused"; persistAndPublish(run); break;
          }
          if (RUN_TERMINAL_STATES.has(run.status)) break;
          continue;
        }
        if (run.tasks.every((candidate) => candidate.status === "succeeded")) {
          if (run.workflowKind === "native") {
            const snapshotIds = new Set((run.approvedTicketsSnapshot?.tickets || []).map((ticket) => ticket.id));
            const verified = [...snapshotIds].every((id) => {
              const completed = run.tasks.find((task) => task.id === id);
              const verdict = completed?.attempts?.at(-1)?.verification;
              return completed?.status === "succeeded" && completed.commit && verdict?.verdict === "pass"
                && verdict.spec?.verdict === "pass" && verdict.standards?.verdict === "pass";
            });
            if (!snapshotIds.size || !verified) {
              stopForReview(run, "Mission verification requires a verified Ticket Commit for every Ticket in the approved snapshot.");
              break;
            }
            addRunEvent(run, "Every Ticket Commit succeeded; starting fresh mission-wide integration verification.");
          }
          await executeFinalVerification(run);
          break;
        }
        stopForReview(run, "No executable task remains; dependencies or task state require review.");
        break;
      }
    } catch (error) {
      run.status = "failed";
      addRunEvent(run, `Managed Run failed: ${error.message}`, "error");
      persistAndPublish(run);
    } finally {
      activeLoops.delete(run.id);
    }
  }

  function isActive(runId) {
    return activeLoops.has(runId);
  }

  return { autoRun, isActive };
}

module.exports = {
  createTaskSchedulerService,
  implementationPrompt,
  integrationPrompt,
  verificationPrompt,
};
