const {
  clonePlanDefinition,
  createApprovedPlanSnapshot,
  createRuntimeTasks,
  extractStructuredJson,
  validateAndNormalizePlan,
} = require("../managedRunUtils");

describe("Managed Run plan contracts", () => {
  test("normalizes bounded task defaults", () => {
    const plan = validateAndNormalizePlan({
      objective: "Ship the feature",
      successCriteria: ["It works"],
      tasks: [
        {
          id: "task-1",
          title: "Implement",
          objective: "Make the focused change",
        },
      ],
    });

    expect(plan.tasks[0]).toMatchObject({
      maxAttempts: 3,
      status: "planned",
      implementationTier: "standard",
      verificationTier: "standard",
    });
  });

  test("keeps approved task definitions separate from runtime task state", () => {
    const normalized = validateAndNormalizePlan({
      objective: "Ship the feature",
      tasks: [{ id: "task-1", title: "Implement", objective: "Build it" }],
    });
    const plan = clonePlanDefinition(normalized);
    const runtimeTasks = createRuntimeTasks(normalized.tasks);
    const snapshot = createApprovedPlanSnapshot(plan, {
      revision: 2,
      approvedAt: "2026-06-30T12:00:00.000Z",
    });

    runtimeTasks[0].status = "succeeded";
    runtimeTasks[0].attempts.push({ number: 1 });

    expect(plan.tasks[0]).not.toBe(runtimeTasks[0]);
    expect(snapshot.tasks[0]).toMatchObject({ id: "task-1", title: "Implement" });
    expect(snapshot.tasks[0]).not.toHaveProperty("status");
    expect(snapshot.tasks[0]).not.toHaveProperty("attempts");
    expect(snapshot).toMatchObject({ revision: 2, provenance: "exact" });
  });

  test("requires successful repository inspection for generated plans", () => {
    const plan = {
      objective: "Ship the feature",
      inspection: {
        status: "blocked",
        repositoryState: "unknown",
        commandsRun: [],
        blocker: "The sandbox could not launch read commands.",
      },
      tasks: [{ id: "task-1", title: "Implement", objective: "Build it" }],
    };

    expect(() =>
      validateAndNormalizePlan(plan, { requireInspection: true }),
    ).toThrow(/repository inspection did not succeed/i);

    plan.inspection = {
      status: "succeeded",
      repositoryState: "empty",
      commandsRun: ["git status --short", "list repository root"],
      filesInspected: [],
      blocker: null,
    };
    expect(
      validateAndNormalizePlan(plan, { requireInspection: true }).inspection,
    ).toMatchObject({ status: "succeeded", repositoryState: "empty" });
  });

  test("rejects unknown and cyclic dependencies", () => {
    expect(() =>
      validateAndNormalizePlan({
        objective: "Broken",
        tasks: [
          {
            id: "task-1",
            title: "One",
            objective: "One",
            dependencies: ["missing"],
          },
        ],
      }),
    ).toThrow(/unknown dependency/i);

    expect(() =>
      validateAndNormalizePlan({
        objective: "Cycle",
        tasks: [
          { id: "a", title: "A", objective: "A", dependencies: ["b"] },
          { id: "b", title: "B", objective: "B", dependencies: ["a"] },
        ],
      }),
    ).toThrow(/dependency cycle/i);
  });

  test("extracts structured output from provider wrappers", () => {
    expect(
      extractStructuredJson(
        JSON.stringify({ result: 'Done\n```json\n{"verdict":"pass"}\n```' }),
      ),
    ).toEqual({ verdict: "pass" });
  });
});
