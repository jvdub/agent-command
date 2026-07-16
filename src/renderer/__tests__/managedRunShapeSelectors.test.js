import { attentionItems, currentAction, journeyStations } from "../managedRunSelectors.js";

function run(status) {
  return { id: "run-1", workflowKind: "native", phase: "shape", status, tasks: [], workers: [] };
}

test("Shape canvas exposes conversation and approval states while Spec stays locked", () => {
  expect(currentAction(run("shaping"))).toMatch(/active Shape conversation/i);
  expect(journeyStations(run("shaping"))[0]).toMatchObject({ status: "active", phase: "conversation active" });
  expect(journeyStations(run("shaping"))[1]).toMatchObject({ status: "locked" });
  const awaiting = run("shape_approval_required");
  expect(currentAction(awaiting)).toMatch(/review and approve/i);
  expect(journeyStations(awaiting)[0].phase).toBe("approval required");
  expect(attentionItems(awaiting)[0]).toMatchObject({ type: "shape_approval_required", taskId: "shape" });
});

test("approved Shape advances the workflow canvas to Spec", () => {
  const approved = { ...run("spec_required"), phase: "spec" };
  expect(journeyStations(approved)[0]).toMatchObject({ status: "succeeded", phase: "approved" });
  expect(journeyStations(approved)[1]).toMatchObject({ status: "active", phase: "current phase" });
});
