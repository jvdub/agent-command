function managedSessionIdsForRun(run, transientOwners = new Map()) {
  const ids = new Set();
  if (run?.shapeSessionId) ids.add(run.shapeSessionId);
  for (const [sessionId, owner] of transientOwners.entries()) {
    if (owner?.runId === run?.id) ids.add(sessionId);
  }
  return [...ids];
}

function findManagedRunIdForSession(runs, sessionId, transientOwners = new Map()) {
  const transient = transientOwners.get(sessionId);
  if (transient?.runId) return transient.runId;
  return [...runs].find((run) => run?.shapeSessionId === sessionId)?.id || null;
}

export { findManagedRunIdForSession, managedSessionIdsForRun };
