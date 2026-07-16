const fs = require("fs");
const os = require("os");
const path = require("path");
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
