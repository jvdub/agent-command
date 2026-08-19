const fs = require("fs");
const os = require("os");
const path = require("path");
const { createManagedRunService } = require("../managedRunService");
const { createManagedRunTicketsArtifactService, validateTicketsMarkdown } = require("../managedRunTicketsArtifactService");

function ticket(id, blockers = "None", overrides = {}) {
  return `## Ticket \`${id}\`: ${overrides.title || "Deliver a visible slice"}\n### Behavior\n${overrides.behavior || "A user can observe the completed behavior end to end."}\n### Acceptance Criteria\n- The behavior is independently demonstrable.\n### Blockers\n- ${blockers}\n### Test Seams\n- Existing service boundary\n### TDD Policy\n${overrides.tdd || "test-first"}\n### TDD Exception\n${overrides.exception || "None"}\n### Verification Guidance\n- Run the focused service test\n### Relevant Context\n- Preserve the approved Spec decisions\n### Implementation Tier\nstandard\n### Verification Tier\nstandard\n### Retry Limit\n3\n### Slice Kind\n${overrides.kind || "tracer-bullet"}\n### Wide Change\n${overrides.wide || "None"}\n`;
}

describe("ticket graph Markdown", () => {
  test("parses independently verifiable tracer bullets and blockers", () => {
    const result = validateTicketsMarkdown(`# Tickets\n\n${ticket("first")}\n${ticket("second", "first")}`);
    expect(result.tickets.map(({ id, dependencies }) => ({ id, dependencies }))).toEqual([
      { id: "first", dependencies: [] }, { id: "second", dependencies: ["first"] },
    ]);
  });
  test("rejects unknown blockers and cycles", () => {
    expect(() => validateTicketsMarkdown(`# Tickets\n${ticket("first", "missing")}`)).toThrow(/unknown blocker/);
    expect(() => validateTicketsMarkdown(`# Tickets\n${ticket("first", "second")}\n${ticket("second", "first")}`)).toThrow(/cycle/);
  });
  test("rejects layer-only slices and undocumented TDD exceptions", () => {
    expect(() => validateTicketsMarkdown(`# Tickets\n${ticket("first", "None", { kind: "layer-only" })}`)).toThrow(/layer-only/);
    expect(() => validateTicketsMarkdown(`# Tickets\n${ticket("first", "None", { tdd: "exception" })}`)).toThrow(/substantive TDD exception/);
  });
  test("requires expand-migrate-contract topology for wide changes", () => {
    const valid = `# Tickets\n${ticket("expand", "None", { kind: "expand", wide: "schema" })}\n${ticket("migrate", "expand", { kind: "migrate", wide: "schema" })}\n${ticket("contract", "migrate", { kind: "contract", wide: "schema" })}`;
    expect(validateTicketsMarkdown(valid).tickets).toHaveLength(3);
    expect(() => validateTicketsMarkdown(`# Tickets\n${ticket("expand", "None", { kind: "expand", wide: "schema" })}`)).toThrow(/expand, migrate, and contract/);
  });
});


test("preserves the immediately previous draft for comparison before approval", () => {
  const run = { runWorkspacePath: fs.mkdtempSync(path.join(os.tmpdir(), "tickets-artifact-")), artifacts: {}, approvals: { spec: { revision: 4 } } };
  const service = createManagedRunTicketsArtifactService();
  const first = `# Tickets\n${ticket("first")}`;
  service.persist(run, first, "worker");
  service.persist(run, first.replace("visible slice", "edited visible slice"), "human");
  expect(run.artifacts.tickets.previousRevisionMarkdown).toBe(`${first.trim()}\n`);
});

test("creates a repository-local Tickets session draft", () => {
  const runWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "tickets-draft-"));
  const service = createManagedRunTicketsArtifactService();

  const draftPath = service.ensureDraft({ runWorkspacePath });

  expect(draftPath).toBe(path.join(runWorkspacePath, "tickets", "tickets.md"));
  expect(fs.readFileSync(draftPath, "utf8")).toContain("# Tickets");
  fs.rmSync(runWorkspacePath, { recursive: true, force: true });
});

test("refreshing a Tickets session draft creates a validated review revision", () => {
  const runWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "tickets-refresh-"));
  const run = {
    id: "run-1", workflowKind: "native", phase: "tickets", status: "tickets_required",
    repoPath: runWorkspacePath, worktreePath: runWorkspacePath, runWorkspacePath,
    ticketsSessionId: "tickets-session", artifacts: { spec: { revision: 1 } },
    approvals: { spec: { revision: 1 } }, events: [], workers: [], tasks: [], usage: {},
  };
  const service = createManagedRunService({
    runs: new Map([[run.id, run]]), managedRunPersistenceService: { save: jest.fn() },
    workerProviderRegistry: {}, workerProcessService: { hasActiveWorker: () => false },
    getTaskSchedulerService: jest.fn(), tokenLedgerService: {}, workspaceFileService: {},
    managedRunWorkspaceService: {}, sessionService: { listSessions: () => [] }, publishRun: jest.fn(),
  });
  const artifactService = createManagedRunTicketsArtifactService();
  const scaffoldPath = artifactService.ensureDraft(run);

  expect(() => service.refreshTicketsReview(run.id)).not.toThrow();
  expect(run).toMatchObject({
    phase: "tickets", status: "tickets_required",
    drafts: { tickets: { path: "tickets/tickets.md", validationError: expect.stringMatching(/invalid capability tier/i) } },
  });
  expect(run.drafts.tickets.markdown).toContain("## Ticket `ticket-id`");
  expect(run.artifacts.tickets).toBeUndefined();

  const draft = `# Tickets\n${ticket("first")}`;
  fs.writeFileSync(scaffoldPath, draft);
  service.refreshTicketsReview(run.id);

  expect(run).toMatchObject({ phase: "tickets", status: "tickets_approval_required" });
  expect(run.artifacts.tickets).toMatchObject({ revision: 1, upstreamSpecRevision: 1 });
  expect(run.artifacts.tickets.markdown).toContain("## Ticket `first`");
  expect(run.drafts.tickets).toBeNull();
  fs.rmSync(runWorkspacePath, { recursive: true, force: true });
});
