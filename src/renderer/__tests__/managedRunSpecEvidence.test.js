import { renderInspector } from "../managedRunInspector.js";

test("Spec evidence shows exact approval provenance and confirmed seams", () => {
  const html = renderInspector({
    run: { workflowKind: "native", phase: "tickets", status: "tickets_required", workers: [], tasks: [], artifacts: { spec: { revision: 2, upstreamShapeRevision: 1 } }, approvals: { shape: {}, spec: { revision: 2, upstreamShapeRevision: 1, approvedAt: "2026-01-01T00:00:00.000Z", testSeamsConfirmed: true } } },
    taskId: "spec", selectedWorkerId: null,
  });
  expect(html).toContain("Spec evidence");
  expect(html).toContain("Revision 2");
  expect(html).toContain("Shape revision 1");
  expect(html).toContain("Test seams explicitly confirmed");
});
