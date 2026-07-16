const fs = require("fs");
const os = require("os");
const path = require("path");
const { createManagedRunService } = require("../managedRunService");

const SPEC = `# Spec

## Problem
The workflow lacks a contract.

## Solution
Create an approved Spec.

## User Stories
- As a maintainer, I can approve the behavior.
- As a reviewer, I can compare revisions.
- As an implementer, I can trust confirmed test seams.

## Implementation Decisions
- Store Markdown revisions.

## Testing Decisions
- Existing seam: Managed Run service.
- Confirmed observable seam: Electron workflow.

## Exclusions
- Ticket execution.

## Further Notes
- Preserve Shape provenance.
`;

function setup(stdout = SPEC) {
  const runWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "managed-spec-"));
  fs.mkdirSync(path.join(runWorkspacePath, "shape"));
  fs.writeFileSync(path.join(runWorkspacePath, "shape", "summary-r1.md"), "# Shape\n\nApproved intent\n");
  fs.writeFileSync(path.join(runWorkspacePath, "shape", "conversation-r1.txt"), "One question at a time\n");
  const run = {
    id: "run", workflowKind: "native", phase: "spec", status: "spec_required",
    specification: "Build revisioned specs", runWorkspacePath, worktreePath: "C:\\worktree", repoPath: "C:\\worktree",
    artifacts: { shape: { summaryRevision: 1, conversationRevision: 1, domain: { recognizedPaths: ["CONTEXT.md"], canonicalTerms: ["Managed Run"], diff: "" } } },
    approvals: { shape: { summaryRevision: 1, conversationRevision: 1, summaryPath: "shape/summary-r1.md", conversationPath: "shape/conversation-r1.txt", documentationCommit: { revision: "abc123" } } },
    events: [], workers: [], tasks: [], routing: { planner: { provider: "codex", tier: "premium", model: "" } }, usage: {},
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const worker = { id: "spec-worker", status: "succeeded", stdout, stderr: "", role: "planner", provider: "codex", tier: "premium", model: "", permissionMode: "read-only", commandPreview: "codex exec", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), usage: {}, git: {} };
  const workerProcessService = { hasActiveWorker: jest.fn(() => false), run: jest.fn(() => ({ workerId: worker.id, completion: Promise.resolve(worker) })) };
  const service = createManagedRunService({ runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() }, workerProviderRegistry: { buildLaunch: jest.fn(() => ({ role: "planner", provider: "codex", tier: "premium", model: "", permissionMode: "read-only", preview: "codex exec" })) }, workerProcessService, getTaskSchedulerService: jest.fn(), tokenLedgerService: { record: jest.fn() }, workspaceFileService: {}, managedRunWorkspaceService: {}, sessionService: { listSessions: () => [] }, publishRun: jest.fn() });
  return { run, service, workerProcessService, runWorkspacePath };
}

test("a fresh read-only worker synthesizes approved Shape context into a revisioned Spec", async () => {
  const { run, service, workerProcessService, runWorkspacePath } = setup();
  await service.generateSpec(run.id);

  expect(workerProcessService.run).toHaveBeenCalledWith(expect.objectContaining({ cwd: "C:\\worktree" }));
  const prompt = workerProcessService.run.mock.calls[0][0].prompt;
  expect(prompt).toContain("Approved intent");
  expect(prompt).toContain("One question at a time");
  expect(prompt).toContain("Managed Run");
  expect(run).toMatchObject({ status: "spec_approval_required", phase: "spec" });
  expect(run.artifacts.spec).toMatchObject({ revision: 1, upstreamShapeRevision: 1 });
  expect(fs.readFileSync(path.join(runWorkspacePath, "spec", "spec-r1.md"), "utf8")).toContain("## Testing Decisions");
});

test("approval records the exact confirmed Spec and advances Tickets", async () => {
  const { run, service } = setup();
  await service.generateSpec(run.id);
  service.approveSpec(run.id, { testSeamsConfirmed: true });

  expect(run).toMatchObject({ phase: "tickets", status: "tickets_required" });
  expect(run.approvals.spec).toMatchObject({ revision: 1, action: "approved", upstreamShapeRevision: 1, upstreamShapeSummaryRevision: 1, upstreamShapeConversationRevision: 1, testSeamsConfirmed: true });
});

test("editing an approved Spec invalidates its approval and downstream artifacts", async () => {
  const { run, service } = setup();
  await service.generateSpec(run.id);
  service.approveSpec(run.id, { testSeamsConfirmed: true });
  run.artifacts.tickets = { revision: 1, stale: false };
  run.approvals.tickets = { revision: 1 };

  service.saveSpec(run.id, SPEC.replace("Create an approved Spec.", "Create an edited approved Spec."));

  expect(run).toMatchObject({ phase: "spec", status: "spec_approval_required" });
  expect(run.approvals.spec).toBeNull();
  expect(run.approvals.tickets).toBeNull();
  expect(run.artifacts.tickets.stale).toBe(true);
  expect(run.artifacts.spec.previousApprovedMarkdown).toContain("Create an approved Spec.");
});

test("approval detects a Run Workspace edit and requires a new revision", async () => {
  const { run, service, runWorkspacePath } = setup();
  await service.generateSpec(run.id);
  fs.writeFileSync(path.join(runWorkspacePath, "spec", "spec.md"), SPEC.replace("contract", "changed contract"));

  expect(() => service.approveSpec(run.id, { testSeamsConfirmed: true })).toThrow(/changed in the Run Workspace/i);
  expect(run.artifacts.spec.revision).toBe(2);
  expect(run.status).toBe("spec_approval_required");
});
