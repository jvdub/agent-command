const fs = require("fs");
const os = require("os");
const path = require("path");
const { createManagedRunService } = require("../managedRunService");

function setup(previews) {
  const runWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "managed-domain-"));
  const run = { id: "run", workflowKind: "native", phase: "shape", status: "shape_required", specification: "Shape it", runWorkspacePath, worktreePath: "C:\\worktree", artifacts: {}, approvals: {}, events: [], workers: [], tasks: [], routing: {}, usage: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const shapeDomainDocumentService = {
    inspect: jest.fn(() => ({ hasConvention: true, recognizedPaths: ["CONTEXT.md"], canonicalTerms: ["Managed Run"] })),
    preview: jest.fn(() => previews.shift() || { fingerprint: "two", diff: "changed", changedPaths: ["CONTEXT.md"] }),
    materializeProposal: jest.fn(() => ({ materialized: false })), saveProposal: jest.fn(),
    commitApproved: jest.fn((_cwd, fingerprint) => ({ fingerprint, revision: "abc123", message: "docs: record Shape domain decisions", paths: ["CONTEXT.md"] })),
    startGuard: jest.fn(), stopGuard: jest.fn(),
  };
  const service = createManagedRunService({ runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() }, workerProviderRegistry: {}, workerProcessService: { hasActiveWorker: () => false }, getTaskSchedulerService: jest.fn(), tokenLedgerService: {}, workspaceFileService: {}, managedRunWorkspaceService: {}, sessionService: { listSessions: () => [{ id: "session", outputBuffer: "settled conversation" }] }, shapeDomainDocumentService, publishRun: jest.fn() });
  service.linkShapeSession(run.id, "session");
  return { run, service, shapeDomainDocumentService };
}

test("Shape fails closed when its write guard cannot start", () => {
  const preview = { fingerprint: "same", diff: "", changedPaths: [] };
  const { run, service, shapeDomainDocumentService } = setup([preview]);
  shapeDomainDocumentService.startGuard.mockImplementation(() => { throw new Error("watch unavailable"); });

  run.shapeSessionId = null;
  run.status = "shape_required";
  expect(() => service.linkShapeSession(run.id, "session")).toThrow(/cannot start without.*write guard/i);
  expect(run).toMatchObject({ status: "shape_required", shapeSessionId: null });
});

test("Shape approval commits the exact reviewed documentation fingerprint", () => {
  const preview = { fingerprint: "same", diff: "domain diff", changedPaths: ["CONTEXT.md"] };
  const { run, service, shapeDomainDocumentService } = setup([preview, preview]);
  service.saveShape(run.id, "# Shape\n\nDecision\n");
  service.approveShape(run.id);

  expect(shapeDomainDocumentService.commitApproved).toHaveBeenCalledWith("C:\\worktree", "same", { allowNewConvention: false });
  expect(run.approvals.shape.documentationCommit).toMatchObject({ revision: "abc123" });
  expect(run.phase).toBe("spec");
});

test("a documentation change after preview invalidates approval before commit", () => {
  const first = { fingerprint: "one", diff: "first", changedPaths: ["CONTEXT.md"] };
  const second = { fingerprint: "two", diff: "second", changedPaths: ["CONTEXT.md"] };
  const { run, service, shapeDomainDocumentService } = setup([first, second]);
  service.saveShape(run.id, "# Shape\n\nDecision\n");

  expect(() => service.approveShape(run.id)).toThrow(/documentation changed after review/i);
  expect(shapeDomainDocumentService.commitApproved).not.toHaveBeenCalled();
  expect(run).toMatchObject({ phase: "shape", status: "shape_approval_required" });
});
