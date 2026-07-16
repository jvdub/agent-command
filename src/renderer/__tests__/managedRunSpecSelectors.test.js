import { attentionItems, currentAction, journeyStations } from "../managedRunSelectors.js";

function run(status, extra = {}) {
  return { id: "run", workflowKind: "native", phase: "spec", status, tasks: [], workers: [], artifacts: {}, ...extra };
}

test("Spec canvas shows generation, approval, stale, and progression states", () => {
  expect(currentAction(run("spec_generating"))).toMatch(/fresh read-only worker/i);
  expect(journeyStations(run("spec_generating"))[1].phase).toBe("generating");
  const awaiting = run("spec_approval_required");
  expect(journeyStations(awaiting)[1].phase).toBe("approval required");
  expect(attentionItems(awaiting)[0].type).toBe("spec_approval_required");
  const stale = run("spec_approval_required", { artifacts: { spec: { stale: true } } });
  expect(journeyStations(stale)[1].phase).toContain("stale");
  const approved = { ...run("tickets_required"), phase: "tickets", approvals: { spec: { revision: 2 } } };
  expect(journeyStations(approved)[1].status).toBe("succeeded");
  expect(journeyStations(approved)[2].status).toBe("active");
});
