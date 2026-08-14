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


test("renders Shape review and approval controls in the selected Workflow Phase panel", () => {
  const run = {
    ...fixture(),
    workflowKind: "native",
    phase: "shape",
    status: "shape_approval_required",
    shapeSessionId: "shape-session",
    artifacts: {
      shape: {
        summaryMarkdown: "# Shape\n\nKeep the workflow canvas.",
        summaryRevision: 2,
        conversationRevision: 3,
        domain: {
          changedPaths: ["docs/domain.md"],
          diff: "+ Managed Runs use a selected-step review panel.",
          proposalMarkdown: "# Proposed domain language",
          hasConvention: false,
        },
      },
    },
    approvals: {},
  };

  const html = renderInspector({ run, taskId: "shape" });

  expect(html).toContain("Workflow Phase");
  expect(html).toContain("Summary revision 2");
  expect(html).toContain("Conversation revision 3");
  expect(html).toContain("Keep the workflow canvas.");
  expect(html).toContain('data-shape-action="refresh"');
  expect(html).toContain('data-shape-action="save"');
  expect(html).toContain('data-shape-action="save-domain-proposal"');
  expect(html).toContain('data-shape-action="refresh-documentation"');
  expect(html).toContain('data-shape-action="approve"');
  expect(html).toContain("docs/domain.md");
  expect(html).toContain("selected-step review panel");
});

test("renders Spec revisions and approval only in the selected Workflow Phase panel", () => {
  const run = { ...fixture(), workflowKind: "native", phase: "spec", status: "spec_approval_required", artifacts: { spec: { revision: 3, upstreamShapeRevision: 2, markdown: "# Spec\n\nObservable behavior", previousApprovedMarkdown: "# Spec v2" } }, approvals: {} };
  const html = renderInspector({ run, taskId: "spec" });
  expect(html).toContain("Workflow Phase");
  expect(html).toContain('data-spec-editor');
  expect(html).toContain('data-spec-action="session"');
  expect(html).toContain("Start Spec Session");
  expect(html).toContain('data-spec-action="refresh-session"');
  expect(html).not.toContain('data-spec-action="generate"');
  const linked = renderInspector({ run: { ...run, specSessionId: "spec-session" }, taskId: "spec" });
  expect(linked).toContain("Open Spec Session");
  expect(linked).toContain('data-open-managed-session="spec-session"');
  expect(html).not.toContain('data-spec-action="save"');
  expect(html).toContain('data-spec-editor readonly');
  expect(html).toContain('data-spec-action="approve"');
  expect(renderInspector({ run, taskId: "shape" })).not.toContain('data-spec-editor');
});

test("shows failed Spec generation worker evidence in the selected Workflow Phase panel", () => {
  const run = {
    ...fixture(),
    workflowKind: "native",
    phase: "spec",
    status: "spec_required",
    artifacts: {},
    approvals: { shape: { summaryRevision: 2 } },
    workers: [{
      id: "spec-worker-3",
      promptKind: "spec_generation",
      status: "failed",
      provider: "codex",
      model: "gpt-5.6",
      commandPreview: "codex exec --sandbox read-only -",
      exitCode: 1,
      stdout: "partial worker output",
      stderr: "model request failed before completion",
      startedAt: "2026-08-14T17:00:00.000Z",
      finishedAt: "2026-08-14T17:01:00.000Z",
      usage: { inputTokens: 0, outputTokens: 0 },
    }],
  };

  const html = renderInspector({ run, taskId: "spec" });

  expect(html).toContain("Spec generation attempts");
  expect(html).toContain("failed · exit 1");
  expect(html).toContain("codex · gpt-5.6");
  expect(html).toContain("model request failed before completion");
  expect(html).toContain("partial worker output");
  expect(renderInspector({ run, taskId: "shape" })).not.toContain("Spec generation attempts");
});

test("renders Ticket graph revisions and approval only in the selected Workflow Phase panel", () => {
  const run = { ...fixture(), workflowKind: "native", phase: "tickets", status: "tickets_approval_required", artifacts: { tickets: { revision: 4, upstreamSpecRevision: 3, markdown: "# Tickets\n\n## T-1" } }, approvals: {} };
  const html = renderInspector({ run, taskId: "tickets" });
  expect(html).toContain("Workflow Phase");
  expect(html).toContain('data-tickets-editor');
  expect(html).toContain('data-tickets-action="generate"');
  expect(html).toContain('data-tickets-action="save"');
  expect(html).toContain('data-tickets-action="approve"');
  expect(renderInspector({ run, taskId: "spec" })).not.toContain('data-tickets-editor');
});
