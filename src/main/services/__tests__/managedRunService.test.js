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
    approvedPlanSnapshot: null,
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
    workspaceFileService: {
      openEditorFileAtRoot: jest.fn(async (_root, filePath) => ({ filePath })),
    },
    managedRunRetentionService: {
      preview: jest.fn(async () => ({ previewToken: "preview" })),
      cleanup: jest.fn(async () => ({ status: "cleaned", retainedMetadata: { runRevision: "run-sha", targetRevision: "target-sha" } })),
    },
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
    expect(run.plan.tasks[0]).not.toBe(run.tasks[0]);
  });

  test("freezes an approved definition and requires its matching snapshot", async () => {
    const { run, service } = createServiceWithPlannerOutput({
      objective: "Build the app",
      inspection: {
        status: "succeeded",
        repositoryState: "nonempty",
        commandsRun: ["git status --short"],
        filesInspected: ["package.json"],
        blocker: null,
      },
      tasks: [{ id: "task-1", title: "Build", objective: "Implement it" }],
    });
    await service.generatePlan(run.id);
    service.approvePlan(run.id);

    run.tasks[0].status = "succeeded";
    expect(run.approvedPlanSnapshot.tasks[0]).not.toHaveProperty("status");
    expect(run.approvedPlanSnapshot).toMatchObject({
      revision: 1,
      provenance: "exact",
    });
  });

  test("returns one exact worker prompt on demand without exposing it in run summaries", async () => {
    const { run, service } = createServiceWithPlannerOutput({
      objective: "Build the app",
      inspection: {
        status: "succeeded",
        repositoryState: "nonempty",
        commandsRun: ["git status --short"],
        filesInspected: ["package.json"],
        blocker: null,
      },
      tasks: [{ id: "task-1", title: "Build", objective: "Implement it" }],
    });
    await service.generatePlan(run.id);
    run.workers[0].prompt = "exact sensitive prompt";
    run.workers[0].promptAvailability = "available";

    expect(service.get(run.id).workers[0].prompt).toBeUndefined();
    expect(service.getWorkerDetail(run.id, run.workers[0].id)).toMatchObject({
      prompt: "exact sensitive prompt",
      promptAvailability: "available",
      promptKind: "planning",
    });
    expect(() => service.getWorkerDetail(run.id, "other-worker")).toThrow(/not found/i);
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

describe("Managed Run archive retention", () => {
  test("archives without deleting evidence and remains inspectable when requested", () => {
    const { run, service } = createServiceWithPlannerOutput({});
    run.runWorkspacePath = "/tmp/run-workspace";
    run.worktreePath = "/tmp/run-worktree";
    run.branchName = "agentic/run";
    run.artifacts = { spec: { markdown: "retained" } };
    const archived = service.archive(run.id);
    expect(archived.archived).toBe(true);
    expect(run.artifacts.spec.markdown).toBe("retained");
    expect(service.list()).toEqual([]);
    expect(service.list({ includeArchived: true })[0]).toMatchObject({ id: run.id, archived: true });
    expect(service.get(run.id).artifacts.spec.markdown).toBe("retained");
  });
});

describe("Managed Run cleanup metadata", () => {
  test("retains approvals and commit SHAs while pruning deleted workspace payloads", async () => {
    const { run, service } = createServiceWithPlannerOutput({});
    run.status = "completed";
    run.approvals = { accept: { verifiedCommit: "run-sha" } };
    run.artifacts = { spec: { markdown: "large body", revision: 3, hash: "artifact-hash" } };
    run.tasks = [{ id: "ticket-1", title: "Ticket", status: "succeeded", commit: "ticket-sha", attempts: [{ stdout: "large evidence" }] }];
    run.workers = [{ id: "worker", prompt: "large prompt" }];
    run.executionHistory = [{ tasks: run.tasks }];
    const result = await service.cleanup(run.id, { previewToken: "preview" });
    expect(result.status).toBe("cleaned");
    expect(run.approvals.accept.verifiedCommit).toBe("run-sha");
    expect(run.retainedMetadata).toMatchObject({ runRevision: "run-sha", targetRevision: "target-sha", ticketCommits: [{ id: "ticket-1", commit: "ticket-sha" }] });
    expect(run.artifacts.spec).toEqual({ path: null, revision: 3, approvedRevision: null, hash: "artifact-hash" });
    expect(run.tasks[0]).toEqual({ id: "ticket-1", title: "Ticket", status: "succeeded", commit: "ticket-sha" });
    expect(run.workers).toEqual([]);
    expect(run.executionHistory).toEqual([]);
  });
});
