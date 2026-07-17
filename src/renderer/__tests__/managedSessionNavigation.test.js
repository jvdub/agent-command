const { findManagedRunIdForSession, managedSessionIdsForRun } = require("../managedSessionNavigation.js");

test("groups persistent and transient sessions under their Managed Run", () => {
  const run = { id: "run-1", shapeSessionId: "shape-session" };
  const owners = new Map([
    ["takeover-session", { runId: "run-1", role: "implementer" }],
    ["other-session", { runId: "run-2", role: "planner" }],
  ]);

  expect(managedSessionIdsForRun(run, owners)).toEqual([
    "shape-session",
    "takeover-session",
  ]);
  expect(findManagedRunIdForSession([run], "shape-session", owners)).toBe("run-1");
  expect(findManagedRunIdForSession([run], "takeover-session", owners)).toBe("run-1");
  expect(findManagedRunIdForSession([run], "ordinary-session", owners)).toBeNull();
});
