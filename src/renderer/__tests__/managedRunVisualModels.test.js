import { renderInbox } from "../managedRunInbox.js";
import { renderInspector } from "../managedRunInspector.js";
import { layoutJourney, renderJourney } from "../managedRunJourney.js";

function fixture() {
  return {
    id: "run-1",
    status: "review_required",
    approvedRevision: 2,
    approvedPlanSnapshot: {
      revision: 2,
      provenance: "exact",
      tasks: [{
        id: "task-1",
        title: "Approved task",
        objective: "Approved objective",
        successCriteria: ["Visible result"],
        relevantScope: ["src"],
        contextNotes: ["Preserve behavior"],
        verificationGuidance: ["Run tests"],
      }],
    },
    tasks: [{
      id: "task-1",
      title: "Approved task",
      objective: "Runtime objective",
      status: "human_review_required",
      order: 1,
      dependencies: [],
      maxAttempts: 3,
      attempts: [{
        number: 1,
        implementationWorkerId: "impl-1",
        verificationWorkerId: "verify-1",
        artifacts: {
          parseStatus: "parsed",
          reportedFiles: ["src/feature.js"],
          observedFiles: ["src/feature.js", "src/other.js"],
        },
        verification: {
          verdict: "fix_required",
          summary: "One criterion failed",
          checks: ["npm test: failed"],
          failedCriteria: ["Visible result"],
          risks: ["Retry needed"],
        },
      }],
    }],
    workers: [
      { id: "impl-1", taskId: "task-1", role: "implementer" },
      { id: "verify-1", taskId: "task-1", role: "verifier" },
    ],
  };
}

test("renders a task journey with verification and retry inside the station", () => {
  const html = renderJourney(fixture(), "task-1");
  expect(html).toContain("Build 1");
  expect(html).toContain("Spec 1");
  expect(html).toContain("Standards 1");
  expect(html).toContain("journey-retry");
  expect(html).toContain("Integration verification");
  expect(html).toContain("journey-canvas");
  expect(html).toContain("journey-edge");
});

test("lays dependency branches into bounded graph columns", () => {
  const run = fixture();
  run.tasks.push({
    id: "task-2",
    title: "Parallel task",
    status: "planned",
    order: 2,
    dependencies: [],
    attempts: [],
  });
  const graph = layoutJourney(run);
  const first = graph.nodes.find((node) => node.id === "task-1");
  const parallel = graph.nodes.find((node) => node.id === "task-2");
  const final = graph.nodes.find((node) => node.id === "final-verification");
  expect(parallel.x).toBe(first.x);
  expect(parallel.y).not.toBe(first.y);
  expect(final.x).toBeGreaterThan(first.x);
  expect(graph.edges).toHaveLength(2);
  const vertical = layoutJourney(run, { direction: "vertical" });
  expect(vertical.nodes.find((node) => node.id === "final-verification").y).toBeGreaterThan(
    vertical.nodes.find((node) => node.id === "task-1").y,
  );
});

test("renders approved definition separately from exact prompt and file provenance", () => {
  const html = renderInspector({
    run: fixture(),
    taskId: "task-1",
    selectedWorkerId: "impl-1",
    workerDetailState: "loaded",
    workerDetail: {
      promptAvailability: "available",
      prompt: "EXACT ONE SHOT PROMPT",
      promptKind: "implementation",
      promptVersion: 1,
      attemptNumber: 1,
      provider: "codex",
      tier: "standard",
      commandPreview: "codex exec -",
      stdout: "worker output",
    },
  });
  expect(html).toContain("Approved objective");
  expect(html).toContain("EXACT ONE SHOT PROMPT");
  expect(html).toContain("Prompt sent");
  expect(html).toContain("src/feature.js");
  expect(html).toContain("working tree after attempt");
  expect(html).toContain("Retry task");
});

test("renders Managed Runs attention without affecting normal-session models", () => {
  const html = renderInbox([fixture()], "run-1");
  expect(html).toContain("task-1 requires review");
  expect(html).toContain('data-inbox-task-id="task-1"');
});
