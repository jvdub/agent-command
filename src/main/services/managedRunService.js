const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { execFileSync } = require("child_process");
const {
  addRunEvent,
  extractStructuredJson,
  nowIso,
  summarizeRun,
  validateAndNormalizePlan,
} = require("./managedRunUtils");

const PLANNING_SAFETY = `Safety rules:
- Inspect the repository but do not modify files.
- Never commit, push, publish, open a pull request, or delete files.
- Preserve unrelated working-tree changes.`;

function planningPrompt(run) {
  return `You are the planning worker for an Agentic Command Managed Run. Create a small, independently verifiable implementation plan. Do not implement it.

Repository: ${run.repoPath}
User specification:
${run.specification}

${PLANNING_SAFETY}

Return exactly one JSON object:
{
  "objective":"mission objective",
  "inspection":{
    "status":"succeeded|blocked",
    "repositoryState":"empty|nonempty|unknown",
    "commandsRun":["read-only command actually run"],
    "filesInspected":["path actually inspected; may be empty for an empty repository"],
    "blocker":null
  },
  "constraints":["constraint"],
  "nonGoals":["non-goal"],
  "successCriteria":["observable mission criterion"],
  "risks":["risk"],
  "unresolvedQuestions":["question requiring human judgment"],
  "finalVerificationGuidance":["mission-wide check"],
  "tasks":[{
    "id":"task-1",
    "title":"bounded title",
    "objective":"specific implementation objective",
    "successCriteria":["observable task criterion"],
    "dependencies":[],
    "relevantScope":["likely path or subsystem"],
    "implementationTier":"economy|standard|premium",
    "verificationTier":"economy|standard|premium",
    "verificationGuidance":["focused check"],
    "contextNotes":["essential context"],
    "maxAttempts":3
  }]
}`;
}

function createManagedRunService({
  runs,
  managedRunPersistenceService,
  workerProviderRegistry,
  workerProcessService,
  getTaskSchedulerService,
  tokenLedgerService,
  publishRun,
}) {
  function requireRun(runId) {
    const run = runs.get(runId);
    if (!run) throw new Error("Managed Run not found.");
    return run;
  }

  function saveAndPublish(run) {
    run.updatedAt = nowIso();
    managedRunPersistenceService.save();
    publishRun(run);
    return summarizeRun(run);
  }

  function inspectRepository(inputPath) {
    const repoPath = path.resolve(String(inputPath || "").trim());
    const isDirectory = Boolean(
      repoPath && fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory(),
    );
    if (!isDirectory) {
      return {
        repoPath,
        isDirectory: false,
        isGitRepository: false,
        isEmpty: false,
      };
    }
    return {
      repoPath,
      isDirectory: true,
      isGitRepository: fs.existsSync(path.join(repoPath, ".git")),
      isEmpty: fs.readdirSync(repoPath).length === 0,
    };
  }

  function create(input) {
    const repository = inspectRepository(input?.repoPath);
    const repoPath = repository.repoPath;
    const specification = String(input?.specification || "").trim();
    if (!specification) throw new Error("A specification is required.");
    if (!repository.isDirectory) {
      throw new Error("Repository path must be a readable directory.");
    }
    if (!repository.isGitRepository) {
      if (input?.initializeGit !== true) {
        throw new Error(
          "Repository path is not a Git working tree. Confirm Git initialization to continue.",
        );
      }
      try {
        execFileSync("git", ["init"], {
          cwd: repoPath,
          windowsHide: true,
          stdio: "pipe",
        });
      } catch (error) {
        throw new Error(
          `Git repository initialization failed: ${error.stderr?.toString().trim() || error.message}`,
        );
      }
      if (!fs.existsSync(path.join(repoPath, ".git"))) {
        throw new Error("Git initialization completed without creating repository metadata.");
      }
    }
    const now = nowIso();
    const provider = String(input?.provider || "codex");
    const run = {
      id: randomUUID(),
      title: String(input?.title || specification.split(/\r?\n/u)[0]).slice(0, 120),
      repoPath,
      specification,
      status: "draft",
      plan: null,
      planSource: null,
      planRevision: 0,
      approvedRevision: null,
      approvedAt: null,
      tasks: [],
      routing: {
        planner: { provider, tier: "premium", model: String(input?.planningModel || "") },
        implementer: { provider, tier: "standard", model: String(input?.implementationModel || "") },
        verifier: { provider, tier: "standard", model: String(input?.verificationModel || "") },
        integration_verifier: { provider, tier: "premium", model: String(input?.integrationModel || "") },
      },
      workers: [],
      events: [],
      usage: tokenLedgerService.createLedger(),
      finalVerification: null,
      activeWorkerId: null,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    addRunEvent(run, "Managed Run created; planning requires a capable worker and human approval.");
    runs.set(run.id, run);
    return saveAndPublish(run);
  }

  function list() {
    return Array.from(runs.values())
      .filter((run) => !run.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summarizeRun);
  }

  function get(runId) {
    return summarizeRun(requireRun(runId));
  }

  async function generatePlan(runId) {
    const run = requireRun(runId);
    if (workerProcessService.hasActiveWorker(run.id)) {
      throw new Error("A worker is already active for this Managed Run.");
    }
    run.status = "planning";
    const launch = workerProviderRegistry.buildLaunch({
      role: "planner",
      selection: run.routing.planner,
    });
    const prompt = planningPrompt(run);
    const execution = workerProcessService.run({
      runId: run.id,
      launch,
      prompt,
      cwd: run.repoPath,
    });
    const placeholder = {
      id: execution.workerId,
      runId: run.id,
      taskId: null,
      role: "planner",
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
      startedAt: nowIso(),
      finishedAt: null,
      usage: null,
      git: null,
    };
    run.workers.push(placeholder);
    run.activeWorkerId = placeholder.id;
    addRunEvent(run, `Starting planner: ${launch.preview}`);
    saveAndPublish(run);
    const worker = await execution.completion;
    const index = run.workers.findIndex((item) => item.id === worker.id);
    if (index >= 0) run.workers[index] = worker;
    run.activeWorkerId = null;
    tokenLedgerService.record(run.usage, worker);
    if (worker.status !== "succeeded") {
      run.status = "review_required";
      addRunEvent(run, "Planning worker failed; inspect its output and retry.", "error");
      return saveAndPublish(run);
    }
    try {
      const plan = validateAndNormalizePlan(extractStructuredJson(worker.stdout), {
        requireInspection: true,
      });
      run.plan = plan;
      run.planSource = "worker";
      run.planRevision += 1;
      run.approvedRevision = null;
      run.approvedAt = null;
      run.tasks = plan.tasks;
      run.status = "approval_required";
      addRunEvent(run, `Plan revision ${run.planRevision} is ready for human approval.`);
    } catch (error) {
      run.status = "review_required";
      addRunEvent(run, `Planning output was invalid: ${error.message}`, "error");
    }
    return saveAndPublish(run);
  }

  function savePlan(runId, rawPlan) {
    const run = requireRun(runId);
    const plan = validateAndNormalizePlan(
      typeof rawPlan === "string" ? JSON.parse(rawPlan) : rawPlan,
    );
    run.plan = plan;
    run.planSource = "human";
    run.planRevision += 1;
    run.approvedRevision = null;
    run.approvedAt = null;
    run.tasks = plan.tasks;
    run.finalVerification = null;
    run.status = "approval_required";
    addRunEvent(run, `Plan revision ${run.planRevision} saved; approval is required.`);
    return saveAndPublish(run);
  }

  function approvePlan(runId) {
    const run = requireRun(runId);
    if (!run.plan || run.planRevision < 1) throw new Error("No plan is available to approve.");
    const generatedPlan =
      run.planSource === "worker" ||
      (!run.planSource && run.workers.some((worker) => worker.role === "planner"));
    if (
      generatedPlan &&
      (run.plan.inspection?.status !== "succeeded" ||
        !Array.isArray(run.plan.inspection?.commandsRun) ||
        run.plan.inspection.commandsRun.length === 0 ||
        run.plan.inspection.blocker)
    ) {
      run.status = "review_required";
      addRunEvent(
        run,
        "Plan approval blocked because repository inspection was not verified. Regenerate or save a human-reviewed replacement plan.",
        "error",
      );
      saveAndPublish(run);
      throw new Error(
        "Generated plans require verified repository inspection before approval.",
      );
    }
    run.approvedRevision = run.planRevision;
    run.approvedAt = nowIso();
    run.status = "ready";
    addRunEvent(run, `Plan revision ${run.planRevision} approved by the user.`);
    return saveAndPublish(run);
  }

  function start(runId) {
    const run = requireRun(runId);
    if (run.approvedRevision !== run.planRevision) {
      throw new Error("The current plan revision must be approved before execution.");
    }
    if (!["ready", "paused", "review_required"].includes(run.status)) {
      throw new Error(`Managed Run cannot start from ${run.status}.`);
    }
    if (run.finalVerification?.verdict === "pass") {
      throw new Error("Final verification already passed; accept or revise the run.");
    }
    const conflict = Array.from(runs.values()).find(
      (candidate) =>
        candidate.id !== run.id &&
        path.resolve(candidate.repoPath) === path.resolve(run.repoPath) &&
        ["running", "final_verification"].includes(candidate.status),
    );
    if (conflict) {
      throw new Error(`Another Managed Run is editing this working tree: ${conflict.title}`);
    }
    run.status = "ready";
    addRunEvent(run, "Automatic serial execution started.");
    saveAndPublish(run);
    void getTaskSchedulerService().autoRun(run);
    return summarizeRun(run);
  }

  function pause(runId) {
    const run = requireRun(runId);
    run.status = "paused";
    addRunEvent(run, "Managed Run paused; the active worker may finish but no new worker will start.");
    return saveAndPublish(run);
  }

  function cancel(runId) {
    const run = requireRun(runId);
    workerProcessService.cancel(run.id);
    run.status = "cancelled";
    addRunEvent(run, "Managed Run cancelled by the user.", "warning");
    return saveAndPublish(run);
  }

  function retry(runId, taskId = null) {
    const run = requireRun(runId);
    const task = taskId
      ? run.tasks.find((item) => item.id === taskId)
      : run.tasks.find((item) =>
          ["failed", "human_review_required", "replan_required"].includes(item.status),
        );
    if (!task) throw new Error("No task is available to retry.");
    task.maxAttempts = Math.max(task.maxAttempts, task.attempts.length + 1);
    task.status = "retry_required";
    run.finalVerification = null;
    run.status = "ready";
    addRunEvent(run, `${task.id} queued for an explicitly approved retry.`);
    saveAndPublish(run);
    void getTaskSchedulerService().autoRun(run);
    return summarizeRun(run);
  }

  function updateRouting(runId, routing) {
    const run = requireRun(runId);
    if (workerProcessService.hasActiveWorker(run.id)) {
      throw new Error("Pause and wait for the active worker before changing routing.");
    }
    for (const role of Object.keys(run.routing)) {
      if (!routing?.[role]) continue;
      run.routing[role] = {
        ...run.routing[role],
        provider: String(routing[role].provider || run.routing[role].provider),
        tier: String(routing[role].tier || run.routing[role].tier),
        model: String(routing[role].model ?? run.routing[role].model),
      };
      workerProviderRegistry.resolveSelection(run.routing[role]);
    }
    addRunEvent(run, "Future worker routing updated by the user.");
    return saveAndPublish(run);
  }

  function accept(runId) {
    const run = requireRun(runId);
    if (run.finalVerification?.verdict !== "pass") {
      throw new Error("A passing final integration verification is required.");
    }
    run.status = "completed";
    addRunEvent(run, "Final result accepted by the user.");
    return saveAndPublish(run);
  }

  function archive(runId) {
    const run = requireRun(runId);
    if (["planning", "running", "final_verification"].includes(run.status)) {
      throw new Error("An active Managed Run cannot be archived.");
    }
    run.archived = true;
    addRunEvent(run, "Managed Run archived.");
    return saveAndPublish(run);
  }

  function setTaskStatus(runId, taskId, status) {
    const run = requireRun(runId);
    if (workerProcessService.hasActiveWorker(run.id)) {
      throw new Error("Task state cannot be overridden while a worker is active.");
    }
    const allowed = new Set([
      "planned",
      "retry_required",
      "human_review_required",
      "succeeded",
      "cancelled",
      "failed",
    ]);
    if (!allowed.has(status)) throw new Error("Unsupported manual task status.");
    const task = run.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("Managed Run task not found.");
    const previous = task.status;
    task.status = status;
    run.finalVerification = null;
    run.status = "review_required";
    addRunEvent(
      run,
      `${task.id} status manually changed from ${previous} to ${status}.`,
      "warning",
      { humanOverride: true },
    );
    return saveAndPublish(run);
  }

  return {
    accept,
    approvePlan,
    archive,
    cancel,
    create,
    generatePlan,
    get,
    inspectRepository,
    list,
    pause,
    retry,
    savePlan,
    setTaskStatus,
    start,
    updateRouting,
  };
}

module.exports = { createManagedRunService, planningPrompt };
