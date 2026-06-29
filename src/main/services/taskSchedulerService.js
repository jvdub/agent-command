const {
  RUN_TERMINAL_STATES,
  addRunEvent,
  extractStructuredJson,
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
        "human_decision_required",
        "environment_blocked",
      ],
    },
    summary: { type: "string" },
    checks: { type: "array", items: { type: "string" } },
    failedCriteria: { type: "array", items: { type: "string" } },
    feedback: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
  },
  required: [
    "verdict",
    "summary",
    "checks",
    "failedCriteria",
    "feedback",
    "risks",
  ],
  additionalProperties: true,
};

function missionContext(run) {
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
Attempt: ${attemptNumber} of ${task.maxAttempts}
Latest verification feedback: ${feedback || "None; this is the first attempt"}

${SAFETY_RULES}

Inspect relevant files, implement the focused change, and run appropriate checks. End with exactly one JSON object:
{"summary":"what changed","changedFiles":["path"],"checks":["command: result"],"risks":["remaining risk"]}`;
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

${SAFETY_RULES}

Inspect the current diff and relevant surrounding code. Run appropriate checks without editing. Return exactly one JSON object:
{"verdict":"pass|fix_required|plan_defect|human_decision_required|environment_blocked","summary":"evidence-based result","checks":["command: result"],"failedCriteria":["criterion"],"feedback":"specific next action","risks":["remaining risk"],"recommendedTier":"economy|standard|premium|null"}`;
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
Final verification guidance: ${run.plan.finalVerificationGuidance.join("; ") || "Verify the complete mission and full diff"}

${SAFETY_RULES}

Inspect the complete diff, check cross-task interactions, and run appropriate broader checks. Return exactly one JSON object:
{"verdict":"pass|fix_required|plan_defect|human_decision_required|environment_blocked","summary":"mission-wide result","checks":["command: result"],"failedCriteria":["criterion"],"feedback":"specific next action","risks":["remaining risk"]}`;
}

function createTaskSchedulerService({
  workerProviderRegistry,
  workerProcessService,
  managedRunPersistenceService,
  tokenLedgerService,
  localInferenceService,
  publishRun,
}) {
  const activeLoops = new Set();

  function persistAndPublish(run) {
    run.updatedAt = new Date().toISOString();
    managedRunPersistenceService.save();
    publishRun(run);
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

  async function launchWorker(run, role, task, prompt) {
    const launch = workerProviderRegistry.buildLaunch({
      role,
      selection: selectionFor(run, role, task),
    });
    const execution = workerProcessService.run({
      runId: run.id,
      taskId: task?.id || null,
      launch,
      prompt,
      cwd: run.repoPath,
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
    );
    persistAndPublish(run);

    const completed = await execution.completion;
    const index = run.workers.findIndex((worker) => worker.id === completed.id);
    if (index >= 0) run.workers[index] = completed;
    run.activeWorkerId = null;
    updateUsage(run, completed);
    addRunEvent(
      run,
      `${role}${task ? ` for ${task.id}` : ""} ${completed.status} (exit ${completed.exitCode}).`,
      completed.status === "succeeded" ? "info" : "error",
    );
    persistAndPublish(run);
    return completed;
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

  async function executeTask(run, task) {
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
    );
    const attempt = {
      number: attemptNumber,
      implementationWorkerId: implementation.id,
      verificationWorkerId: null,
      verification: null,
      startedAt: implementation.startedAt,
      finishedAt: null,
    };
    task.attempts.push(attempt);

    if (implementation.status !== "succeeded") {
      attempt.finishedAt = implementation.finishedAt;
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

    task.status = "awaiting_verification";
    persistAndPublish(run);
    task.status = "verifying";
    const verification = await launchWorker(
      run,
      "verifier",
      task,
      verificationPrompt(run, task, implementation),
    );
    attempt.verificationWorkerId = verification.id;
    attempt.finishedAt = verification.finishedAt;
    if (verification.status !== "succeeded") {
      if (verification.status === "cancelled" || run.status === "cancelled") {
        task.status = "cancelled";
        persistAndPublish(run);
        return;
      }
      task.status = "human_review_required";
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
      task.status = "human_review_required";
      stopForReview(run, `${task.id} verifier output was malformed: ${error.message}`);
      return;
    }
    const allowed = new Set([
      "pass",
      "fix_required",
      "plan_defect",
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
    };

    if (outcome.verdict === "pass") {
      task.status = "succeeded";
      addRunEvent(run, `${task.id} passed independent verification.`);
      persistAndPublish(run);
      return;
    }
    if (outcome.verdict === "fix_required" && attemptNumber < task.maxAttempts) {
      task.status = "retry_required";
      addRunEvent(run, `${task.id} requires another implementation attempt.`, "warning");
      persistAndPublish(run);
      return;
    }
    if (outcome.verdict === "plan_defect") {
      task.status = "replan_required";
      run.status = "replan_required";
      addRunEvent(run, `${task.id} exposed a plan defect.`, "warning");
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

  async function executeFinalVerification(run) {
    run.status = "final_verification";
    persistAndPublish(run);
    const worker = await launchWorker(
      run,
      "integration_verifier",
      null,
      integrationPrompt(run),
    );
    if (worker.status !== "succeeded") {
      stopForReview(run, "Final integration verifier failed to complete.");
      return;
    }
    try {
      const outcome = await resolveVerificationOutcome(
        run,
        worker,
        "Final verifier",
      );
      run.finalVerification = {
        workerId: worker.id,
        verdict: outcome.verdict,
        summary: String(outcome.summary || ""),
        checks: Array.isArray(outcome.checks) ? outcome.checks : [],
        failedCriteria: Array.isArray(outcome.failedCriteria)
          ? outcome.failedCriteria
          : [],
        feedback: String(outcome.feedback || ""),
        risks: Array.isArray(outcome.risks) ? outcome.risks : [],
      };
      stopForReview(
        run,
        outcome.verdict === "pass"
          ? "Final integration verification passed; human acceptance is required."
          : `Final integration verification returned ${outcome.verdict}.`,
        outcome.verdict === "pass" ? "info" : "warning",
      );
    } catch (error) {
      stopForReview(run, `Final verifier output was malformed: ${error.message}`);
    }
  }

  async function autoRun(run) {
    if (activeLoops.has(run.id)) return;
    activeLoops.add(run.id);
    try {
      while (!RUN_TERMINAL_STATES.has(run.status)) {
        const task = nextExecutableTask(run);
        if (task) {
          await executeTask(run, task);
          continue;
        }
        if (run.tasks.every((candidate) => candidate.status === "succeeded")) {
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
