const { journeyStations, currentAction, attentionItems } = require("../managedRunSelectors");

describe("native Ticket workflow selectors", () => {
  test("expands an approved Ticket graph and identifies the executable frontier", () => {
    const run = {
      id: "run", workflowKind: "native", phase: "implement", status: "implement_ready",
      approvedTicketsSnapshot: { tickets: [
        { id: "a", title: "First slice", dependencies: [], maxAttempts: 3 },
        { id: "b", title: "Dependent slice", dependencies: ["a"], maxAttempts: 2 },
      ] },
      tasks: [],
    };
    const stations = journeyStations(run);
    expect(stations.find((station) => station.id === "a").phase).toBe("executable frontier");
    expect(stations.find((station) => station.id === "b").dependencies).toEqual(["a"]);
    expect(stations.find((station) => station.id === "implement").dependencies).toEqual(["a", "b"]);
    run.tasks = [{ id: "a", status: "succeeded", attempts: [] }, { id: "b", status: "planned", attempts: [] }];
    expect(journeyStations(run).find((station) => station.id === "b").phase).toBe("executable frontier");
  });

  test("surfaces Ticket generation and approval as native actions", () => {
    const run = { id: "run", workflowKind: "native", phase: "tickets", status: "tickets_approval_required", artifacts: { tickets: { stale: false } }, tasks: [] };
    expect(currentAction(run)).toMatch(/approve the Ticket dependency graph/);
    expect(attentionItems(run)[0].type).toBe("tickets_approval_required");
  });
});
