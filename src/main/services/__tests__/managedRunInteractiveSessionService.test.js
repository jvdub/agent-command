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

test("Spec starts and links an interactive planner session with a repository-local draft", () => {
  const registry = createWorkerProviderRegistry({
    env: {
      AGENTIC_MANAGED_CLAUDE_COMMAND: "claude",
      AGENTIC_MANAGED_CLAUDE_DEFAULT_MODEL: "claude-default",
    },
  });
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "spec-session-"));
  const runWorkspacePath = path.join(worktreePath, ".managed-run");
  const run = {
    id: "run-1", workflowKind: "native", title: "Interactive Spec",
    repoPath: worktreePath, worktreePath, runWorkspacePath,
    phase: "spec", status: "spec_required", shapeSessionId: "shape-session", specSessionId: null,
    routing: { planner: { provider: "claude", tier: "premium", model: "claude-special" } },
    artifacts: {}, approvals: { shape: { summaryRevision: 1 } }, events: [], workers: [], tasks: [], usage: {},
  };
  const sessionService = {
    startSession: jest.fn(() => ({ id: "spec-session", isRunning: true })),
    listSessions: jest.fn(() => [{ id: "spec-session", isRunning: true }]),
  };
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: registry,
    workerProcessService: { hasActiveWorker: () => false }, getTaskSchedulerService: jest.fn(),
    tokenLedgerService: {}, workspaceFileService: {}, managedRunWorkspaceService: {},
    sessionService, publishRun: jest.fn(),
  });

  const result = service.startInteractiveSession(run.id, "spec");

  expect(sessionService.startSession).toHaveBeenCalledWith({
    label: "Spec: Interactive Spec", command: "claude",
    argsArray: ["--model", "claude-special"], cols: 120, rows: 36,
  }, worktreePath);
  expect(result.session.id).toBe("spec-session");
  expect(run).toMatchObject({
    phase: "spec", status: "spec_required", specSessionId: "spec-session",
  });
  expect(fs.readFileSync(path.join(runWorkspacePath, "spec", "spec.md"), "utf8"))
    .toContain("## Testing Decisions");
  fs.rmSync(worktreePath, { recursive: true, force: true });
});

test("Tickets starts and links an interactive planner session with a repository-local draft", () => {
  const registry = createWorkerProviderRegistry({ env: {
    AGENTIC_MANAGED_CLAUDE_COMMAND: "claude",
    AGENTIC_MANAGED_CLAUDE_DEFAULT_MODEL: "claude-default",
  } });
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "tickets-session-"));
  const runWorkspacePath = path.join(worktreePath, ".managed-run");
  const run = {
    id: "run-1", workflowKind: "native", title: "Interactive Tickets",
    repoPath: worktreePath, worktreePath, runWorkspacePath,
    phase: "tickets", status: "tickets_required", ticketsSessionId: null,
    routing: { planner: { provider: "claude", tier: "premium", model: "claude-special" } },
    artifacts: { spec: { revision: 1 } }, approvals: { spec: { revision: 1 } },
    events: [], workers: [], tasks: [], usage: {},
  };
  const sessionService = {
    startSession: jest.fn(() => ({ id: "tickets-session", isRunning: true })),
    listSessions: jest.fn(() => [{ id: "tickets-session", isRunning: true }]),
  };
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: registry,
    workerProcessService: { hasActiveWorker: () => false }, getTaskSchedulerService: jest.fn(),
    tokenLedgerService: {}, workspaceFileService: {}, managedRunWorkspaceService: {},
    sessionService, publishRun: jest.fn(),
  });

  const result = service.startInteractiveSession(run.id, "tickets");

  expect(sessionService.startSession).toHaveBeenCalledWith({
    label: "Tickets: Interactive Tickets", command: "claude",
    argsArray: ["--model", "claude-special"], cols: 120, rows: 36,
  }, worktreePath);
  expect(result.session.id).toBe("tickets-session");
  expect(run).toMatchObject({
    phase: "tickets", status: "tickets_required", ticketsSessionId: "tickets-session",
  });
  expect(fs.readFileSync(path.join(runWorkspacePath, "tickets", "tickets.md"), "utf8"))
    .toContain("### Acceptance Criteria");
  fs.rmSync(worktreePath, { recursive: true, force: true });
});
