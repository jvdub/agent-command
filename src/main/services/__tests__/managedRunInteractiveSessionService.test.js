const fs = require("fs");
const os = require("os");
const path = require("path");
const { createManagedRunService } = require("../managedRunService");
const { createWorkerProviderRegistry } = require("../workerProviderRegistry");

test("Shape starts an interactive session through the configured CLI harness", () => {
  const registry = createWorkerProviderRegistry({
    env: {
      AGENTIC_MANAGED_CODEX_COMMAND: "C:\\tools\\codex.cmd",
      AGENTIC_MANAGED_CODEX_COMMAND_ARGS: '["--profile","managed"]',
      AGENTIC_MANAGED_CODEX_DEFAULT_MODEL: "codex-default",
    },
  });
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "shape-harness-"));
  const run = {
    id: "run-1", workflowKind: "native", title: "Harness repro",
    repoPath: worktreePath, worktreePath,
    runWorkspacePath: path.join(worktreePath, ".managed-run"),
    phase: "shape", status: "shape_required", shapeSessionId: null,
    routing: { planner: { provider: "codex", tier: "premium", model: "codex-special" } },
    artifacts: {}, approvals: {}, events: [], workers: [], tasks: [], usage: {},
  };
  const sessionService = {
    startSession: jest.fn(() => ({ id: "shape-session", isRunning: true })),
    listSessions: jest.fn(() => [{ id: "shape-session", isRunning: true }]),
  };
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: registry,
    workerProcessService: { hasActiveWorker: () => false }, getTaskSchedulerService: jest.fn(),
    tokenLedgerService: {}, workspaceFileService: {}, managedRunWorkspaceService: {},
    sessionService, publishRun: jest.fn(),
  });

  const result = service.startInteractiveSession(run.id, "planner");

  expect(sessionService.startSession).toHaveBeenCalledWith({
    label: "Shape: Harness repro", command: "C:\\tools\\codex.cmd",
    argsArray: ["--profile", "managed", "--model", "codex-special"], cols: 120, rows: 36,
  }, worktreePath);
  expect(result.session.id).toBe("shape-session");
  expect(run.shapeSessionId).toBe("shape-session");
  fs.rmSync(worktreePath, { recursive: true, force: true });
});
