const { createManagedRunRevisionService } = require("../managedRunRevisionService");

const oldTicket = { id: "ticket-1", title: "Old", behavior: "works", acceptanceCriteria: ["yes"], dependencies: [] };
function run() {
  return {
    phase: "implement", status: "implement_ready", lastVerifiedCommit: "abc123",
    approvals: { shape: { revision: 1 }, spec: { revision: 1 }, tickets: { revision: 1 } },
    approvedTicketsSnapshot: { revision: 1, tickets: [oldTicket] },
    tasks: [{ ...oldTicket, status: "succeeded", commit: { revision: "abc123" }, attempts: [{ evidencePath: "evidence/1.json" }] }, { id: "ticket-2", status: "planned" }],
    artifacts: { tickets: { projection: [] } },
  };
}

describe("Managed Run revision lineage", () => {
  test.each(["shape", "spec", "tickets"])("archives verified history when returning to %s", (phase) => {
    const value = run();
    createManagedRunRevisionService({ now: () => "now" }).beginRevision(value, phase, `${phase} defect`);
    expect(value.executionHistory[0]).toMatchObject({ snapshotRevision: 1, lastVerifiedCommit: "abc123", targetPhase: phase });
    expect(value.executionHistory[0].tasks[0].attempts[0].evidencePath).toBe("evidence/1.json");
    expect(value.tasks.map((task) => task.status)).toEqual(["succeeded", "stale"]);
    expect(value.lastVerifiedCommit).toBe("abc123");
  });

  test("classifies preserved commits and requires an explicit disposition", () => {
    const value = run(); const service = createManagedRunRevisionService({ now: () => "now" });
    service.beginRevision(value, "tickets", "Ticket defect");
    const revised = [{ ...oldTicket, title: "Changed" }, { id: "reversal", title: "Reverse", behavior: "undo", acceptanceCriteria: ["undone"], dependencies: [] }];
    value.artifacts.tickets.projection = revised;
    expect(service.reconcile(value, revised).entries[0].compatibility).toBe("questionable");
    expect(() => service.assertResolved(value)).toThrow(/retain applicable work or identify valid reversal work/);
    expect(() => service.decide(value, "ticket-1", "retain")).not.toThrow();
    value.artifacts.tickets.projection[0].maxAttempts = 7;
    service.reconcile(value, value.artifacts.tickets.projection);
    expect(value.revisionReconciliation.entries[0].disposition).toBeNull();
    value.revisionReconciliation.entries[0].compatibility = "incompatible";
    expect(() => service.decide(value, "ticket-1", "retain")).toThrow(/reversal/);
    service.decide(value, "ticket-1", "reverse", "reversal");
    expect(() => service.assertResolved(value)).not.toThrow();
    value.artifacts.tickets.projection = revised.filter((ticket) => ticket.id !== "reversal");
    service.reconcile(value, value.artifacts.tickets.projection);
    expect(value.revisionReconciliation.entries[0].disposition).toBeNull();
    expect(() => service.assertResolved(value)).toThrow(/valid reversal work/);
  });
});
