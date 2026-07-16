const { createManagedRunService } = require("../managedRunService");

function harness(integrationResult) {
  const run = {
    id: "run-1", workflowKind: "native", phase: "accept", status: "review_required",
    sourceRepoPath: "/repo", worktreePath: "/worktree", targetBranch: "main", branchName: "agentic/run",
    baseRevision: "base", lastVerifiedCommit: "verified", approvals: {}, artifacts: {}, tasks: [], workers: [], events: [], usage: {},
    finalVerification: { workerId: "final-1", verdict: "pass", verifiedCommit: "verified", checks: ["mission: pass"], risks: [] },
  };
  const integration = {
    preview: jest.fn(() => ({ status: "preview", mode: "fast_forward", targetBranch: "main", targetRevision: "base", runRevision: "verified" })),
    integrate: jest.fn(() => integrationResult),
  };
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: {}, workerProcessService: { hasActiveWorker: () => false }, getTaskSchedulerService: jest.fn(),
    tokenLedgerService: {}, workspaceFileService: {}, managedRunWorkspaceService: {}, managedRunTicketExecutionService: {},
    managedRunIntegrationService: integration, sessionService: { listSessions: () => [] }, publishRun: jest.fn(),
  });
  return { run, service, integration };
}

test("Accept records the human gate and resulting local target revision", () => {
  const { run, service } = harness({ status: "integrated", mode: "fast_forward", targetBranch: "main", targetRevision: "base", runRevision: "verified", resultingRevision: "verified" });
  service.previewAcceptance(run.id);
  const accepted = service.accept(run.id);
  expect(accepted).toMatchObject({ status: "completed", integration: { targetBranch: "main", resultingRevision: "verified" }, approvals: { accept: { finalVerificationWorkerId: "final-1", verifiedCommit: "verified" } } });
});

test("Accept exposes moved-target confirmation and conflicts without recording approval", () => {
  const confirmation = harness({ status: "confirmation_required", mode: "normal_merge", targetBranch: "main", targetRevision: "moved", runRevision: "verified" });
  expect(confirmation.service.accept(confirmation.run.id)).toMatchObject({ status: "accept_confirmation_required" });
  expect(confirmation.run.approvals.accept).toBeUndefined();
  const conflict = harness({ status: "conflicts", mode: "normal_merge", targetBranch: "main", targetRevision: "moved", runRevision: "verified", conflictPaths: ["shared.txt"], targetWorktreePath: "/repo" });
  expect(conflict.service.accept(conflict.run.id, { confirmMovedTarget: true })).toMatchObject({ status: "integration_conflicts", integration: { conflictPaths: ["shared.txt"] } });
  expect(conflict.run.approvals.accept).toMatchObject({ finalVerificationWorkerId: "final-1", verifiedCommit: "verified" });
});

test("Accept rejects final evidence for an older Run branch commit", () => {
  const { run, service, integration } = harness({ status: "integrated" });
  run.lastVerifiedCommit = "newer";
  expect(() => service.accept(run.id)).toThrow(/latest passing mission verification/i);
  expect(integration.integrate).not.toHaveBeenCalled();
});
