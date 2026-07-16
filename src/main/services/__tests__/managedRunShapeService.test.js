const fs = require("fs");
const os = require("os");
const path = require("path");
const { createManagedRunService } = require("../managedRunService");

function setup() {
  const runWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "managed-shape-"));
  const run = {
    id: "run-1", title: "Native workflow", workflowKind: "native", phase: "shape",
    status: "shape_required", specification: "Make sessions deliberate", runWorkspacePath,
    artifacts: {}, approvals: {}, events: [], workers: [], tasks: [], routing: {}, usage: {},
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const sessions = [{ id: "shape-session", outputBuffer: "Question: who is this for?\r\nAnswer: maintainers", isRunning: true }];
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: {}, workerProcessService: { hasActiveWorker: () => false },
    getTaskSchedulerService: jest.fn(), tokenLedgerService: {}, workspaceFileService: {},
    managedRunWorkspaceService: {}, sessionService: { listSessions: () => sessions }, publishRun: jest.fn(),
  });
  return { run, service, runWorkspacePath, sessions };
}

describe("native Managed Run Shape", () => {
  test("links a persistent session and revisions the transcript with an editable summary", () => {
    const { run, service, runWorkspacePath } = setup();
    service.linkShapeSession(run.id, "shape-session");
    const result = service.saveShape(run.id, "# Shape\n\n## Decision\n\nUse native workers.\n");

    expect(result).toMatchObject({ status: "shape_approval_required", shapeSessionId: "shape-session" });
    expect(run.artifacts.shape).toMatchObject({ summaryRevision: 1, conversationRevision: 1 });
    expect(fs.readFileSync(path.join(runWorkspacePath, "shape", "summary.md"), "utf8")).toContain("Use native workers");
    expect(fs.readFileSync(path.join(runWorkspacePath, "shape", "conversation-r1.txt"), "utf8")).toContain("who is this for");
  });

  test("approval records exact revisions and a later edit blocks Spec again", () => {
    const { run, service } = setup();
    service.linkShapeSession(run.id, "shape-session");
    service.saveShape(run.id, "# Shape\n\nFirst decision\n");
    service.approveShape(run.id);

    expect(run).toMatchObject({ phase: "spec", status: "spec_required" });
    expect(run.approvals.shape).toMatchObject({ summaryRevision: 1, conversationRevision: 1 });

    service.saveShape(run.id, "# Shape\n\nChanged decision\n");
    expect(run).toMatchObject({ phase: "shape", status: "shape_approval_required" });
    expect(run.approvals.shape).toBeNull();
    expect(run.artifacts.shape.summaryRevision).toBe(2);
  });

  test("approval snapshots a conversation that changed after the summary was saved", () => {
    const { run, service, sessions } = setup();
    service.linkShapeSession(run.id, "shape-session");
    service.saveShape(run.id, "# Shape\n\nDecision\n");
    sessions[0].outputBuffer += "\nA later decision";

    expect(() => service.approveShape(run.id)).toThrow(/changed after its last saved revision/i);
    expect(run.artifacts.shape.conversationRevision).toBe(2);
    expect(run.status).toBe("shape_approval_required");
  });

  test("refreshing an approved run detects a workspace edit and re-blocks Spec", () => {
    const { run, service, runWorkspacePath } = setup();
    service.linkShapeSession(run.id, "shape-session");
    service.saveShape(run.id, "# Shape\n\nOriginal\n");
    service.approveShape(run.id);
    fs.writeFileSync(path.join(runWorkspacePath, "shape", "summary.md"), "# Shape\n\nEdited after approval\n");

    expect(service.get(run.id)).toMatchObject({ phase: "shape", status: "shape_approval_required" });
    expect(run.approvals.shape).toBeNull();
    expect(run.artifacts.shape.summaryRevision).toBe(2);
  });

  test("approval notices a workspace edit and requires approval of a new revision", () => {
    const { run, service, runWorkspacePath } = setup();
    service.linkShapeSession(run.id, "shape-session");
    service.saveShape(run.id, "# Shape\n\nOriginal\n");
    fs.writeFileSync(path.join(runWorkspacePath, "shape", "summary.md"), "# Shape\n\nEdited outside the app\n");

    expect(() => service.approveShape(run.id)).toThrow(/changed after its last saved revision/i);
    expect(run.artifacts.shape.summaryRevision).toBe(2);
    expect(run.status).toBe("shape_approval_required");
  });
});
