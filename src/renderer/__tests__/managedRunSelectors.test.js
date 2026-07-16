import {
  attentionItems,
  currentAction,
  journeyStations,
  runProgress,
  taskDefinition,
} from "../managedRunSelectors.js";

function runFixture() {
  return {
    id: "run-1",
    status: "running",
    approvedPlanSnapshot: {
      revision: 1,
      tasks: [{ id: "task-1", title: "Approved title", objective: "Approved objective" }],
    },
    tasks: [
      {
        id: "task-1",
        title: "Runtime title",
        status: "succeeded",
        dependencies: [],
        attempts: [{
          number: 1,
          implementationWorkerId: "impl-1",
          verificationWorkerId: "verify-1",
          verification: { verdict: "pass" },
        }],
      },
      {
        id: "task-2",
        title: "Retry task",
        status: "retry_required",
        dependencies: ["task-1"],
        maxAttempts: 3,
        attempts: [{
          number: 1,
          implementationWorkerId: "impl-2",
          verificationWorkerId: "verify-2",
          verification: { verdict: "fix_required" },
        }],
      },
    ],
    workers: [],
  };
}

test("projects progress, approved definitions, retry loops, and final station", () => {
  const run = runFixture();
  expect(runProgress(run)).toEqual({ total: 2, verified: 1, attempts: 2, retries: 0 });
  expect(taskDefinition(run, "task-1").title).toBe("Approved title");
  const stations = journeyStations(run);
  expect(stations[1].segments.map((segment) => segment.kind)).toEqual([
    "implementation",
    "verification",
    "retry",
  ]);
  expect(stations.at(-1)).toMatchObject({ id: "final-verification", status: "locked" });
  expect(currentAction(run)).toMatch(/task-2: retry queued/i);
});

test("derives stable task and final acceptance attention items", () => {
  const run = runFixture();
  run.status = "review_required";
  run.tasks[1].status = "human_review_required";
  run.finalVerification = { verdict: "pass" };
  expect(attentionItems(run)).toEqual([
    expect.objectContaining({
      id: "run-1:human_review_required:task-2:1",
      taskId: "task-2",
    }),
    expect.objectContaining({ type: "acceptance_required" }),
  ]);
});


test("shows mission verification and verified repair work before Accept", () => {
  const ticket = { id: "ticket-1", title: "Slice", dependencies: [], maxAttempts: 3 };
  const run = {
    workflowKind: "native", phase: "accept", status: "review_required",
    approvedTicketsSnapshot: { revision: 1, tickets: [ticket] },
    tasks: [{ ...ticket, status: "succeeded", attempts: [{ verification: { verdict: "pass" } }] }],
    integrationRepairs: [{ id: "integration-repair-1", title: "Repair integrated mission", status: "succeeded", maxAttempts: 3, attempts: [{ verification: { verdict: "pass" } }], commit: { revision: "abcdef1234567890" } }],
    finalVerification: { verdict: "pass" },
  };
  const stations = journeyStations(run);
  expect(stations.find((station) => station.id === "mission-verification")).toMatchObject({ status: "succeeded", phase: "pass" });
  expect(stations.find((station) => station.id === "integration-repair-1")).toMatchObject({ kind: "integration-repair", status: "succeeded" });
  expect(stations.at(-1)).toMatchObject({ id: "accept", status: "active", dependencies: ["integration-repair-1", "mission-verification"] });
});


test("shows local integration conflicts and accepted completion on the canvas", () => {
  const ticket = { id: "ticket-1", title: "Slice", dependencies: [], maxAttempts: 3 };
  const run = { workflowKind: "native", phase: "accept", approvedTicketsSnapshot: { revision: 1, tickets: [ticket] }, tasks: [{ ...ticket, status: "succeeded", attempts: [] }], finalVerification: { verdict: "pass" }, status: "integration_conflicts", integration: { conflictPaths: ["shared.txt"] } };
  expect(journeyStations(run).at(-1)).toMatchObject({ id: "accept", status: "human_review_required", phase: "conflicts · shared.txt" });
  run.status = "completed"; run.integration = { resultingRevision: "abcdef1234567890" };
  expect(journeyStations(run).at(-1)).toMatchObject({ status: "succeeded", phase: "integrated abcdef123456" });
});
