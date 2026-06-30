import { markdownToPlan, planToMarkdown } from "../managedRunPlanMarkdown.js";

describe("Managed Run plan Markdown", () => {
  const plan = {
    objective: "Build a useful todo app",
    inspection: {
      status: "succeeded",
      repositoryState: "empty",
      commandsRun: ["git status --short", "Get-ChildItem -Force"],
      filesInspected: [],
      blocker: null,
    },
    successCriteria: ["Users can manage due dates"],
    constraints: ["Keep it local"],
    nonGoals: [],
    risks: ["Date handling"],
    unresolvedQuestions: [],
    finalVerificationGuidance: ["Run the full test suite"],
    tasks: [
      {
        id: "task-1",
        title: "Create the app",
        objective: "Scaffold and implement the todo experience",
        successCriteria: ["The app starts"],
        dependencies: [],
        relevantScope: ["src/"],
        implementationTier: "standard",
        verificationTier: "economy",
        verificationGuidance: ["Exercise the primary flow"],
        contextNotes: ["The repository is empty"],
        maxAttempts: 3,
      },
    ],
  };

  test("renders a readable plan instead of JSON", () => {
    const markdown = planToMarkdown(plan);
    expect(markdown).toContain("# Objective\n\nBuild a useful todo app");
    expect(markdown).toContain("## Task `task-1`: Create the app");
    expect(markdown).not.toContain('"objective"');
  });

  test("round-trips orchestration fields through editable Markdown", () => {
    expect(markdownToPlan(planToMarkdown(plan))).toEqual(plan);
  });

  test("reports malformed task headings clearly", () => {
    expect(() => markdownToPlan("# Objective\n\nBuild it\n\n# Tasks\n\nNo tasks"))
      .toThrow(/Task `id`/i);
  });
});
