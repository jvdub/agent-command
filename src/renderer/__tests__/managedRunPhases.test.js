import { currentAction, journeyStations } from "../managedRunSelectors.js";

test("projects a new run as the five-phase workflow with Shape active", () => {
  const run = {
    id: "run-native",
    workflowVersion: 1,
    phase: "shape",
    status: "shape_required",
    artifacts: {},
    tasks: [],
    workers: [],
  };

  const stations = journeyStations(run);
  expect(stations.map((station) => station.id)).toEqual([
    "shape",
    "spec",
    "tickets",
    "implement",
    "accept",
  ]);
  expect(stations.map((station) => station.status)).toEqual([
    "active",
    "locked",
    "locked",
    "locked",
    "locked",
  ]);
  expect(currentAction(run)).toMatch(/shape the idea/i);
});
