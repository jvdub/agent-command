const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createManagedRunService } = require("../managedRunService");
const { createManagedRunTicketExecutionService } = require("../managedRunTicketExecutionService");

function setup() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-recovery-"));
  const git = (args) => execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], { cwd, encoding: "utf8" }).trim();
  git(["init", "--initial-branch=main"]); git(["config", "user.name", "Recovery Test"]); git(["config", "user.email", "recovery@example.com"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n"); git(["add", "base.txt"]); git(["commit", "-m", "Initial commit"]);
  const baseRevision = git(["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(cwd, "failed.txt"), "preserve until confirmed\n");
  const run = {
    id: "run", workflowKind: "native", phase: "implement", status: "paused",
    worktreePath: cwd, repoPath: cwd, baseRevision, lastVerifiedCommit: baseRevision,
    tasks: [{ id: "ticket-a", status: "human_review_required", maxAttempts: 3, attempts: [{}, {}, {}] }],
    approvals: {}, artifacts: {}, events: [], workers: [], usage: {}, routing: {},
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: {}, workerProcessService: { hasActiveWorker: () => false },
    getTaskSchedulerService: () => ({ autoRun: jest.fn() }), tokenLedgerService: {}, workspaceFileService: {},
    managedRunWorkspaceService: {}, managedRunTicketExecutionService: createManagedRunTicketExecutionService(),
    sessionService: { listSessions: () => [] }, publishRun: jest.fn(),
  });
  return { cwd, git, run, service };
}

test("only the user can extend an exhausted budget while paused", () => {
  const { run, service } = setup();
  service.updateTicketAttemptBudget(run.id, "ticket-a", 4);
  expect(run.tasks[0].maxAttempts).toBe(4);
  expect(run.events.at(-1)).toMatchObject({ detail: { humanOverride: true } });
});

test("restoration requires separate confirmation and preserves recovery evidence", async () => {
  const { cwd, git, run, service } = setup();
  await expect(service.recoverTicket(run.id, "ticket-a", "restore_verified_base", false)).rejects.toThrow(/Separately confirm/);
  expect(fs.existsSync(path.join(cwd, "failed.txt"))).toBe(true);
  await service.recoverTicket(run.id, "ticket-a", "restore_verified_base", true);
  expect(fs.existsSync(path.join(cwd, "failed.txt"))).toBe(false);
  expect(git(["status", "--porcelain"])).toBe("");
  expect(run.tasks[0]).toMatchObject({ status: "retry_required", recoveries: [{ action: "restore_verified_base", revision: run.baseRevision }] });
});
