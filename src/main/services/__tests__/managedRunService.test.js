const { createManagedRunService } = require("../managedRunService");

function createRun() {
  return {
    id: "run-1",
    repoPath: "C:\\dev\\todo",
    specification: "Build a todo app",
    status: "draft",
    plan: null,
    planSource: null,
    planRevision: 0,
    approvedRevision: null,
    approvedAt: null,
    tasks: [],
    routing: { planner: { provider: "codex", tier: "premium", model: "" } },
    workers: [],
    events: [],
    usage: {},
    finalVerification: null,
    activeWorkerId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createServiceWithPlannerOutput(plannerOutput) {
  const run = createRun();
  const runs = new Map([[run.id, run]]);
  const worker = {
    id: "worker-1",
    runId: run.id,
    taskId: null,
    role: "planner",
    provider: "codex",
    tier: "premium",
    model: "",
    modelFlagUsed: false,
    permissionMode: "read-only",
    commandPreview: "codex exec --sandbox read-only -",
    prompt: "",
    stdout: JSON.stringify(plannerOutput),
    stderr: "",
    exitCode: 0,
    status: "succeeded",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    usage: {},
    git: {},
  };
  const service = createManagedRunService({
    runs,
    managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: {
      buildLaunch: jest.fn(() => ({
        role: "planner",
        provider: "codex",
        tier: "premium",
        model: "",
        modelFlagUsed: false,
        permissionMode: "read-only",
        preview: worker.commandPreview,
      })),
    },
    workerProcessService: {
      hasActiveWorker: jest.fn(() => false),
      run: jest.fn(() => ({
        workerId: worker.id,
        completion: Promise.resolve(worker),
      })),
    },
    getTaskSchedulerService: jest.fn(),
    tokenLedgerService: { record: jest.fn(), createLedger: jest.fn(() => ({})) },
    publishRun: jest.fn(),
  });
  return { run, service };
}

describe("Managed Run planning", () => {
  test("does not make a plan approvable when repository inspection was blocked", async () => {
    const { run, service } = createServiceWithPlannerOutput({
      objective: "Build the app",
      inspection: {
        status: "blocked",
        repositoryState: "unknown",
        commandsRun: [],
        blocker: "The sandbox could not launch read commands.",
      },
      tasks: [{ id: "task-1", title: "Discover", objective: "Inspect the repo" }],
    });

    await service.generatePlan(run.id);

    expect(run.status).toBe("review_required");
    expect(run.plan).toBeNull();
    expect(run.events.at(-1).message).toMatch(/not approvable/i);
  });

  test("accepts inspection evidence for an empty repository", async () => {
    const { run, service } = createServiceWithPlannerOutput({
      objective: "Build the app",
      inspection: {
        status: "succeeded",
        repositoryState: "empty",
        commandsRun: ["git status --short", "list repository root"],
        filesInspected: [],
        blocker: null,
      },
      tasks: [{ id: "task-1", title: "Scaffold", objective: "Create the app" }],
    });

    await service.generatePlan(run.id);

    expect(run.status).toBe("approval_required");
    expect(run.plan.inspection.repositoryState).toBe("empty");
  });

  test("blocks approval of a persisted legacy planner result without inspection", () => {
    const { run, service } = createServiceWithPlannerOutput({});
    run.planRevision = 1;
    run.status = "approval_required";
    run.plan = {
      objective: "Build the app",
      tasks: [{ id: "task-1", title: "Discover", objective: "Inspect it" }],
    };
    run.workers.push({ role: "planner" });

    expect(() => service.approvePlan(run.id)).toThrow(/verified repository inspection/i);
    expect(run.status).toBe("review_required");
  });
});
