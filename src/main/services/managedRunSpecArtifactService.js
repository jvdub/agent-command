const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { nowIso } = require("./managedRunUtils");

const SPEC_HEADINGS = [
  "Problem", "Solution", "User Stories", "Implementation Decisions",
  "Testing Decisions", "Exclusions", "Further Notes",
];

function validateSpecMarkdown(value) {
  const markdown = String(value || "").trim().replace(/^```(?:markdown)?\s*|\s*```$/giu, "");
  if (!markdown) throw new Error("Spec Markdown is empty.");
  for (const heading of SPEC_HEADINGS) {
    if (!new RegExp(`^## ${heading}$`, "mu").test(markdown)) throw new Error(`Spec is missing ## ${heading}.`);
  }
  const userStories = markdown.match(/^- As (?:a|an) .+$/gimu) || [];
  if (userStories.length < 3) throw new Error("Spec requires at least three substantive user stories.");
  const testing = markdown.match(/^## Testing Decisions\s*([\s\S]*?)(?=^## |$)/mu)?.[1] || "";
  if (!/existing.+seam/isu.test(testing) || !/confirm/iu.test(testing)) {
    throw new Error("Testing Decisions must identify existing seams and require explicit confirmation.");
  }
  return `${markdown}\n`;
}

function specPrompt(run, shapeSummary, conversation, domainDocuments) {
  return `You are a fresh read-only Spec worker for an Agentic Command Managed Run. Synthesize the approved Shape context into a precise implementation contract. Inspect repository context using read-only commands and prefer the highest practical existing observable test seams. If a new test seam is necessary, label it explicitly as proposed and requiring human confirmation. Do not implement or modify files.

Repository: ${run.worktreePath}
Original idea:
${run.specification}

Approved Shape summary:
${shapeSummary}

Approved Shape conversation:
${conversation}

Domain documentation and architectural decisions:
${domainDocuments || "None recognized."}

Return only Markdown with exactly these level-two sections, each substantive:
## Problem
## Solution
## User Stories
## Implementation Decisions
## Testing Decisions
## Exclusions
## Further Notes

User Stories must be extensive. Testing Decisions must name existing observable seams, identify any proposed new seams, and state that the user must explicitly confirm the selected seams before approval.`;
}

function createManagedRunSpecArtifactService() {
  function paths(run) {
    const directory = path.join(run.runWorkspacePath, "spec");
    fs.mkdirSync(directory, { recursive: true });
    return { directory, current: path.join(directory, "spec.md") };
  }

  function persist(run, markdown, source) {
    const content = validateSpecMarkdown(markdown);
    const resolved = paths(run);
    const artifact = run.artifacts.spec ||= { revision: 0, approvedRevision: null, revisions: [] };
    if (artifact.approvedRevision) artifact.previousApprovedMarkdown = artifact.markdown;
    artifact.revision += 1;
    artifact.markdown = content;
    artifact.hash = createHash("sha256").update(content).digest("hex");
    artifact.upstreamShapeRevision = run.approvals.shape.summaryRevision;
    artifact.upstreamShapeSummaryRevision = run.approvals.shape.summaryRevision;
    artifact.upstreamShapeConversationRevision = run.approvals.shape.conversationRevision;
    artifact.stale = false;
    const revisionPath = `spec/spec-r${artifact.revision}.md`;
    fs.writeFileSync(resolved.current, content, "utf8");
    fs.writeFileSync(path.join(run.runWorkspacePath, revisionPath), content, "utf8");
    artifact.revisions.push({ revision: artifact.revision, path: revisionPath, source, upstreamShapeRevision: artifact.upstreamShapeRevision, upstreamShapeConversationRevision: artifact.upstreamShapeConversationRevision, createdAt: nowIso() });
    return artifact;
  }

  function readCurrent(run) {
    return fs.readFileSync(paths(run).current, "utf8");
  }

  function fingerprint(markdown) {
    return createHash("sha256").update(String(markdown)).digest("hex");
  }

  return { fingerprint, persist, readCurrent };
}

module.exports = { createManagedRunSpecArtifactService, specPrompt, validateSpecMarkdown };
