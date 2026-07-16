const { createHash } = require("crypto");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
  return value;
}

function fingerprint(ticket) {
  return createHash("sha256").update(JSON.stringify(canonical(ticket))).digest("hex");
}

function createManagedRunRevisionService({ now = () => new Date().toISOString() } = {}) {
  function archiveExecution(run, reason, targetPhase) {
    const snapshot = run.approvedTicketsSnapshot;
    if (!snapshot || !(run.tasks || []).some((task) => task.status === "succeeded")) return null;
    run.executionHistory ||= [];
    const existing = run.executionHistory.find((entry) => entry.snapshotRevision === snapshot.revision);
    if (existing) return existing;
    const entry = {
      id: `execution-${run.executionHistory.length + 1}`,
      snapshotRevision: snapshot.revision,
      approvedTicketsSnapshot: clone(snapshot),
      approvals: clone(run.approvals),
      tasks: clone(run.tasks),
      lastVerifiedCommit: run.lastVerifiedCommit || null,
      archivedAt: now(), reason, targetPhase,
    };
    run.executionHistory.push(entry);
    return entry;
  }

  function beginRevision(run, targetPhase, reason) {
    const archived = archiveExecution(run, reason, targetPhase);
    run.revisionRequest = { targetPhase, reason, requestedAt: now() };
    if (archived) {
      run.preservedTicketCommits = archived.tasks.filter((task) => task.status === "succeeded" && task.commit)
        .map((task) => ({ id: task.id, title: task.title, commit: clone(task.commit), evidence: clone(task.attempts || []), status: "preserved" }));
    }
    for (const task of run.tasks || []) {
      if (task.status !== "succeeded") task.status = "stale";
    }
    run.phase = targetPhase;
    run.status = `${targetPhase}_revision_required`;
    return archived;
  }

  function reconcile(run, tickets) {
    const previous = run.executionHistory?.at(-1);
    if (!previous) { run.revisionReconciliation = null; return null; }
    const completed = previous.tasks.filter((task) => task.status === "succeeded" && task.commit);
    if (!completed.length) { run.revisionReconciliation = null; return null; }
    const priorDecisions = new Map((run.revisionReconciliation?.entries || []).map((entry) => [entry.ticketId, entry]));
    const entries = completed.map((task) => {
      const replacement = tickets.find((ticket) => ticket.id === task.id);
      const original = previous.approvedTicketsSnapshot.tickets.find((ticket) => ticket.id === task.id) || task;
      const compatibility = !replacement ? "incompatible" : fingerprint(original) === fingerprint(replacement) ? "applicable" : "questionable";
      const replacementFingerprint = replacement ? fingerprint(replacement) : null;
      const prior = priorDecisions.get(task.id);
      const reversal = tickets.find((ticket) => ticket.id === prior?.reversalTicketId);
      const reversalStillMatches = prior?.disposition !== "reverse" || (reversal && fingerprint(reversal) === prior.reversalFingerprint);
      const decisionStillValid = prior && prior.compatibility === compatibility
        && prior.replacementFingerprint === replacementFingerprint && reversalStillMatches
        && !(compatibility === "incompatible" && prior.disposition === "retain");
      return {
        ticketId: task.id, title: task.title, commit: clone(task.commit), compatibility, replacementFingerprint,
        disposition: decisionStillValid ? prior.disposition : null,
        reversalTicketId: decisionStillValid ? prior.reversalTicketId : null,
        reversalFingerprint: decisionStillValid ? prior.reversalFingerprint : null,
        decidedAt: decisionStillValid ? prior.decidedAt : null,
      };
    });
    run.revisionReconciliation = { previousSnapshotRevision: previous.snapshotRevision, createdAt: now(), entries };
    return run.revisionReconciliation;
  }

  function decide(run, ticketId, disposition, reversalTicketId = null) {
    if (!run.revisionReconciliation) throw new Error("No revision reconciliation is required.");
    if (!['retain', 'reverse'].includes(disposition)) throw new Error("Choose retain or reverse.");
    const entry = run.revisionReconciliation.entries.find((item) => item.ticketId === ticketId);
    if (!entry) throw new Error("Preserved Ticket commit not found.");
    if (entry.compatibility === "incompatible" && disposition === "retain") throw new Error("Incompatible verified work requires an explicit reversal Ticket.");
    if (disposition === "reverse") {
      const projection = run.artifacts?.tickets?.projection || [];
      if (!reversalTicketId || !projection.some((ticket) => ticket.id === reversalTicketId)) throw new Error("Reversal work must identify a Ticket in the revised graph.");
    }
    entry.disposition = disposition; entry.reversalTicketId = disposition === "reverse" ? reversalTicketId : null;
    entry.reversalFingerprint = disposition === "reverse" ? fingerprint(run.artifacts.tickets.projection.find((ticket) => ticket.id === reversalTicketId)) : null;
    entry.decidedAt = now();
    return entry;
  }

  function assertResolved(run) {
    const projection = run.artifacts?.tickets?.projection || [];
    const invalid = run.revisionReconciliation?.entries.filter((entry) => !entry.disposition
      || (entry.compatibility === "incompatible" && entry.disposition === "retain")
      || (entry.disposition === "reverse" && !projection.some((ticket) => ticket.id === entry.reversalTicketId))) || [];
    if (invalid.length) throw new Error("Explicitly retain applicable work or identify valid reversal work for every preserved Ticket commit before approval.");
  }

  return { archiveExecution, beginRevision, reconcile, decide, assertResolved };
}

module.exports = { createManagedRunRevisionService };
