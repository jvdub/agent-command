import { renderInspector } from "../managedRunInspector.js";

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
