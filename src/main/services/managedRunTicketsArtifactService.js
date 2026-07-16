const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { nowIso } = require("./managedRunUtils");

const FIELDS = [
  "Behavior", "Acceptance Criteria", "Blockers", "Test Seams", "TDD Policy",
  "TDD Exception", "Verification Guidance", "Relevant Context",
  "Implementation Tier", "Verification Tier", "Retry Limit", "Slice Kind", "Wide Change",
];
const TIERS = new Set(["economy", "standard", "premium"]);
const SLICE_KINDS = new Set([
  "tracer-bullet", "prerequisite-refactor", "mechanical-migration",
  "infrastructure-exception", "expand", "migrate", "contract",
]);

function section(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return body.match(new RegExp(`^### ${escaped}\\s*\\n([\\s\\S]*?)(?=^### |(?![\\s\\S]))`, "mu"))?.[1].trim() || "";
}

function list(value) {
  const items = value.split(/\r?\n/u).map((line) => line.replace(/^\s*-\s*/u, "").trim()).filter(Boolean);
  return items.length === 1 && /^_?none_?\.?$/iu.test(items[0]) ? [] : items;
}

function validateTicketsMarkdown(value) {
  const markdown = String(value || "").trim().replace(/^```(?:markdown)?\s*|\s*```$/giu, "");
  if (!/^# Tickets$/mu.test(markdown)) throw new Error("Tickets Markdown must start with # Tickets.");
  const matches = [...markdown.matchAll(/^## Ticket `([^`]+)`: (.+)\s*\n([\s\S]*?)(?=^## Ticket `|(?![\s\S]))/gmu)];
  if (!matches.length) throw new Error("At least one Ticket is required.");
  const tickets = matches.map((match) => {
    const [, id, title, body] = match;
    for (const field of FIELDS) if (!new RegExp(`^### ${field}$`, "mu").test(body)) throw new Error(`${id} is missing ### ${field}.`);
    const ticket = {
      id, title: title.trim(), behavior: section(body, "Behavior"),
      acceptanceCriteria: list(section(body, "Acceptance Criteria")),
      dependencies: list(section(body, "Blockers")), testSeams: list(section(body, "Test Seams")),
      tddPolicy: section(body, "TDD Policy").toLowerCase(), tddException: section(body, "TDD Exception"),
      verificationGuidance: list(section(body, "Verification Guidance")),
      contextNotes: list(section(body, "Relevant Context")),
      implementationTier: section(body, "Implementation Tier").toLowerCase(),
      verificationTier: section(body, "Verification Tier").toLowerCase(),
      maxAttempts: Number(section(body, "Retry Limit")),
      sliceKind: section(body, "Slice Kind").toLowerCase(),
      wideChange: section(body, "Wide Change").toLowerCase(),
    };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) throw new Error(`${id} has an invalid identifier.`);
    if (!ticket.behavior || !ticket.acceptanceCriteria.length || !ticket.testSeams.length || !ticket.verificationGuidance.length || !ticket.contextNotes.length) throw new Error(`${id} has empty required execution guidance.`);
    if (!TIERS.has(ticket.implementationTier) || !TIERS.has(ticket.verificationTier)) throw new Error(`${id} has an invalid capability tier.`);
    if (!Number.isInteger(ticket.maxAttempts) || ticket.maxAttempts < 1 || ticket.maxAttempts > 10) throw new Error(`${id} has an invalid retry limit.`);
    if (!SLICE_KINDS.has(ticket.sliceKind)) throw new Error(`${id} has an invalid Slice Kind; layer-only tickets are not allowed.`);
    if (!["test-first", "exception"].includes(ticket.tddPolicy)) throw new Error(`${id} TDD Policy must be test-first or exception.`);
    if (ticket.tddPolicy === "exception" && /^_?none_?\.?$/iu.test(ticket.tddException)) throw new Error(`${id} requires a substantive TDD exception.`);
    return ticket;
  });
  const byId = new Map();
  for (const ticket of tickets) {
    if (byId.has(ticket.id)) throw new Error(`Duplicate Ticket identifier: ${ticket.id}.`);
    byId.set(ticket.id, ticket);
  }
  for (const ticket of tickets) for (const dependency of ticket.dependencies) if (!byId.has(dependency)) throw new Error(`${ticket.id} references unknown blocker ${dependency}.`);
  const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Ticket dependency cycle includes ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id); byId.get(id).dependencies.forEach(visit); visiting.delete(id); visited.add(id);
  }
  tickets.forEach((ticket) => visit(ticket.id));
  const groups = new Map();
  for (const ticket of tickets) if (!/^_?none_?$/iu.test(ticket.wideChange)) {
    const group = groups.get(ticket.wideChange) || []; group.push(ticket); groups.set(ticket.wideChange, group);
  }
  for (const [name, group] of groups) {
    const kinds = new Set(group.map((ticket) => ticket.sliceKind));
    if (!["expand", "migrate", "contract"].every((kind) => kinds.has(kind))) throw new Error(`Wide Change ${name} must contain expand, migrate, and contract Tickets.`);
    const expands = group.filter((ticket) => ticket.sliceKind === "expand").map((ticket) => ticket.id);
    const migrates = group.filter((ticket) => ticket.sliceKind === "migrate");
    for (const ticket of migrates) if (!ticket.dependencies.some((id) => expands.includes(id))) throw new Error(`${ticket.id} must depend on an expand Ticket in ${name}.`);
    for (const ticket of group.filter((item) => item.sliceKind === "contract")) if (!migrates.every((item) => ticket.dependencies.includes(item.id))) throw new Error(`${ticket.id} must depend on every migrate Ticket in ${name}.`);
  }
  return { markdown: `${markdown}\n`, tickets };
}

function ticketsPrompt(run, specMarkdown, domainDocuments) {
  return `You are a fresh read-only Ticket worker. Convert the exact approved Spec into independently demonstrable vertical tracer-bullet Tickets. Inspect repository context read-only. Reject layer-only work unless it is explicitly a prerequisite-refactor, mechanical-migration, or indivisible infrastructure-exception. Model wide changes as expand, migrate, then contract while keeping the repository green. Do not implement or modify files.\n\nRepository: ${run.worktreePath}\nApproved Spec:\n${specMarkdown}\n\nConfirmed test seams and domain context:\n${domainDocuments || "None recognized."}\n\nReturn only Markdown beginning # Tickets. Each ticket must be: ## Ticket \`ticket-id\`: Title, followed by exactly these level-three sections: ${FIELDS.join(", ")}. Blockers contain ticket IDs or None. TDD Policy is test-first or exception, and an exception requires a reason. Tiers are economy, standard, or premium. Retry Limit is 1-10. Slice Kind is tracer-bullet, prerequisite-refactor, mechanical-migration, infrastructure-exception, expand, migrate, or contract. Wide Change is None or a shared group identifier.`;
}

function createManagedRunTicketsArtifactService() {
  function paths(run) { const directory = path.join(run.runWorkspacePath, "tickets"); fs.mkdirSync(directory, { recursive: true }); return { directory, current: path.join(directory, "tickets.md") }; }
  function persist(run, markdown, source) {
    const parsed = validateTicketsMarkdown(markdown); const resolved = paths(run);
    const artifact = run.artifacts.tickets ||= { revision: 0, approvedRevision: null, revisions: [] };
    if (artifact.revision) artifact.previousRevisionMarkdown = artifact.markdown;
    if (artifact.approvedRevision) artifact.previousApprovedMarkdown = artifact.markdown;
    artifact.revision += 1; artifact.markdown = parsed.markdown; artifact.projection = parsed.tickets;
    artifact.hash = createHash("sha256").update(parsed.markdown).digest("hex"); artifact.upstreamSpecRevision = run.approvals.spec.revision; artifact.stale = false;
    const revisionPath = `tickets/tickets-r${artifact.revision}.md`;
    fs.writeFileSync(resolved.current, parsed.markdown, "utf8"); fs.writeFileSync(path.join(run.runWorkspacePath, revisionPath), parsed.markdown, "utf8");
    artifact.revisions.push({ revision: artifact.revision, path: revisionPath, source, upstreamSpecRevision: artifact.upstreamSpecRevision, createdAt: nowIso() });
    return artifact;
  }
  function readCurrent(run) { return fs.readFileSync(paths(run).current, "utf8"); }
  function fingerprint(markdown) { return createHash("sha256").update(String(markdown)).digest("hex"); }
  function freeze(run) { const artifact = run.artifacts.tickets; return JSON.parse(JSON.stringify({ revision: artifact.revision, specRevision: run.approvals.spec.revision, approvedAt: nowIso(), tickets: artifact.projection })); }
  return { fingerprint, freeze, persist, readCurrent };
}

module.exports = { createManagedRunTicketsArtifactService, ticketsPrompt, validateTicketsMarkdown };
