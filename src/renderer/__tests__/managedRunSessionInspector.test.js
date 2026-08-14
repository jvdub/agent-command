import { renderInspector } from "../managedRunInspector.js";
import { refreshSelectedSessionReview } from "../managedRunsView.js";

test("offers the linked Shape session from the Shape node inspector", () => {
  const html = renderInspector({
    run: {
      workflowKind: "native",
      phase: "shape",
      status: "shaping",
      shapeSessionId: "shape-session-1",
      artifacts: { shape: {} },
      approvals: {},
    },
    taskId: "shape",
  });

  expect(html).toContain("Open session");
  expect(html).toContain('data-open-managed-session="shape-session-1"');
});

test("returning to a linked Spec review imports the session draft", async () => {
  const refreshShape = jest.fn();
  const refreshSpec = jest.fn(() => Promise.resolve({
    id: "run-1", status: "spec_approval_required",
    artifacts: { spec: { markdown: "# Spec\n\n## Problem\nConnected" } },
  }));

  const refreshed = await refreshSelectedSessionReview(
    { id: "run-1", specSessionId: "spec-session-1" }, "spec",
    { refreshShape, refreshSpec },
  );

  expect(refreshSpec).toHaveBeenCalledWith("run-1");
  expect(refreshShape).not.toHaveBeenCalled();
  expect(refreshed.status).toBe("spec_approval_required");
});

test("returning to a linked Tickets review imports the session draft", async () => {
  const refreshShape = jest.fn();
  const refreshSpec = jest.fn();
  const refreshTickets = jest.fn(() => Promise.resolve({
    id: "run-1", status: "tickets_approval_required",
    artifacts: { tickets: { markdown: "# Tickets" } },
  }));

  const refreshed = await refreshSelectedSessionReview(
    { id: "run-1", ticketsSessionId: "tickets-session-1" }, "tickets",
    { refreshShape, refreshSpec, refreshTickets },
  );

  expect(refreshTickets).toHaveBeenCalledWith("run-1");
  expect(refreshShape).not.toHaveBeenCalled();
  expect(refreshSpec).not.toHaveBeenCalled();
  expect(refreshed.status).toBe("tickets_approval_required");
});
