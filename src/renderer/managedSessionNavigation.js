function managedSessionIdsForRun(run, transientOwners = new Map()) {
  const ids = new Set();
  if (run?.shapeSessionId) ids.add(run.shapeSessionId);
  if (run?.specSessionId) ids.add(run.specSessionId);
  if (run?.ticketsSessionId) ids.add(run.ticketsSessionId);
  for (const [sessionId, owner] of transientOwners.entries()) {
    if (owner?.runId === run?.id) ids.add(sessionId);
  }
  return [...ids];
}

function findManagedRunIdForSession(runs, sessionId, transientOwners = new Map()) {
  const transient = transientOwners.get(sessionId);
  if (transient?.runId) return transient.runId;
  return [...runs].find((run) => [run?.shapeSessionId, run?.specSessionId, run?.ticketsSessionId].includes(sessionId))?.id || null;
}

export { findManagedRunIdForSession, managedSessionIdsForRun };
