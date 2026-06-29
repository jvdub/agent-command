const {
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
