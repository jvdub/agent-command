const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { launchElectronApp } = require("./helpers/electronApp");

const SPEC_MARKDOWN = `# Spec

## Problem
Managed Runs need an approved contract.

## Solution
Persist and approve revisioned Spec Markdown.

## User Stories
- As a user, I can edit a generated Spec.
- As a reviewer, I can compare approved revisions.
- As an implementer, I can trust confirmed test seams.

## Implementation Decisions
- Keep canonical Markdown in the Run Workspace.

## Testing Decisions
- Existing seam: Managed Run service.
- Confirmed observable seam: Electron workflow.

## Exclusions
- Ticket execution.

## Further Notes
- Preserve Shape provenance.
`;

const TICKETS_MARKDOWN = `# Tickets

## Ticket \`ticket-a\`: First visible slice
### Behavior
A user sees the first slice.
### Acceptance Criteria
- The first slice is independently demonstrable.
### Blockers
- None
### Test Seams
- Existing Managed Run service seam
### TDD Policy
test-first
### TDD Exception
None
### Verification Guidance
- Run the focused service test
### Relevant Context
- Preserve the approved Spec
### Implementation Tier
standard
### Verification Tier
standard
### Retry Limit
3
### Slice Kind
tracer-bullet
### Wide Change
None

## Ticket \`ticket-b\`: Dependent visible slice
### Behavior
A user sees the dependent slice.
### Acceptance Criteria
- The dependent slice is independently demonstrable.
### Blockers
- ticket-a
### Test Seams
- Existing Electron workflow seam
### TDD Policy
test-first
### TDD Exception
None
### Verification Guidance
- Run the deterministic Electron check
### Relevant Context
- Build on the first slice
### Implementation Tier
standard
### Verification Tier
premium
### Retry Limit
2
### Slice Kind
tracer-bullet
### Wide Change
None

## Ticket \`ticket-c\`: Exhausted dependent slice
### Behavior
A user sees the final dependent slice.
### Acceptance Criteria
- The final slice is independently demonstrable.
### Blockers
- ticket-b
### Test Seams
- Existing Electron workflow seam
### TDD Policy
test-first
### TDD Exception
None
### Verification Guidance
- Run the deterministic Electron check
### Relevant Context
- Preserve failed evidence when exhausted
### Implementation Tier
standard
### Verification Tier
standard
### Retry Limit
3
### Slice Kind
tracer-bullet
### Wide Change
None
`;

const IMPLEMENTATION_RESULT = JSON.stringify({ summary: "implemented one slice", changedFiles: ["ticket-output.txt"], redEvidence: ["ticket output was absent"], greenEvidence: ["ticket output exists"], alternativeVerificationEvidence: [], checks: ["deterministic check: pass"], risks: [] });
const TICKET_VERIFICATION_RESULT = JSON.stringify({ verdict: "pass", spec: { verdict: "pass", findings: [] }, standards: { verdict: "pass", findings: [] }, summary: "both axes passed", checks: ["deterministic check: pass"], failedCriteria: [], feedback: "", risks: [] });
const TICKET_FIX_RESULT = JSON.stringify({ verdict: "fix_required", spec: { verdict: "fail", findings: ["retry fixture"] }, standards: { verdict: "pass", findings: [] }, summary: "fix required", checks: [], failedCriteria: ["visible"], feedback: "correct the deterministic fixture", risks: [] });

function git(cwd, args) {
  return execFileSync("git", ["-c", `safe.directory=${cwd}`, "-C", cwd, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

test("a Managed Run starts in an isolated Shape workspace", async ({}, testInfo) => {
  const sourceRepo = testInfo.outputPath("native-run-source");
  fs.mkdirSync(sourceRepo, { recursive: true });
  git(sourceRepo, ["init", "--initial-branch=main"]);
  git(sourceRepo, ["config", "user.email", "managed-run@example.com"]);
  git(sourceRepo, ["config", "user.name", "Managed Run E2E"]);
  fs.writeFileSync(path.join(sourceRepo, "README.md"), "# Native run\n", "utf8");
  fs.writeFileSync(path.join(sourceRepo, "CONTEXT.md"), "# Language\n\n**Managed Run**: durable workflow\n", "utf8");
  git(sourceRepo, ["add", "README.md", "CONTEXT.md"]);
  git(sourceRepo, ["commit", "-m", "Initial commit"]);
  fs.writeFileSync(path.join(sourceRepo, "local-only.txt"), "keep me\n", "utf8");

  const fakeSpecWorker = testInfo.outputPath("fake-spec-worker.js");
  fs.writeFileSync(fakeSpecWorker, `const fs = require("fs"); const path = require("path"); let input = ""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { if (input.includes("fresh read-only Ticket worker")) return process.stdout.write(${JSON.stringify(TICKETS_MARKDOWN)}); const id = input.match(/Task ID: (ticket-[a-z])/u)?.[1]; const attempt = Number(input.match(/Attempt: (\d+)/u)?.[1] || input.match(/attempt (\d+)/iu)?.[1] || 1); if (input.includes("implementation worker")) { const file = id + "-output.txt"; fs.writeFileSync(path.join(process.cwd(), file), id + " attempt " + attempt + "\n"); return process.stdout.write(JSON.stringify({ ...JSON.parse(${JSON.stringify(IMPLEMENTATION_RESULT)}), summary: id + " attempt " + attempt, changedFiles: [file] })); } if (input.includes("independent read-only verification worker")) return process.stdout.write(id === "ticket-c" || (id === "ticket-b" && input.includes("ticket-b attempt 1")) ? ${JSON.stringify(TICKET_FIX_RESULT)} : ${JSON.stringify(TICKET_VERIFICATION_RESULT)}); process.stdout.write(${JSON.stringify(SPEC_MARKDOWN)}); });\n`, "utf8");
  const { electronApp, window } = await launchElectronApp(
    testInfo,
    "native-run-appdata",
    { env: { AGENTIC_MANAGED_CODEX_COMMAND: process.execPath, AGENTIC_MANAGED_CODEX_COMMAND_ARGS: JSON.stringify([fakeSpecWorker]) } },
  );

  try {
    await window.getByRole("button", { name: "Create managed run" }).click();
    await window.locator("#managed-run-title-input").fill("Native workflow");
    await window.locator("#managed-run-repo-input").fill(sourceRepo);
    await window.locator("#managed-run-spec-input").fill("Shape a native workflow.");
    window.once("dialog", (dialog) => dialog.accept());
    await window.locator("#managed-run-form button[type='submit']").click();

    await expect(window.locator("#managed-run-view")).toBeVisible();
    const baseRevision = git(sourceRepo, ["rev-parse", "HEAD"]);
    await expect(window.locator("#managed-run-current-action")).toContainText(
      "Open a persistent Shape conversation",
    );
    await expect(window.locator("#managed-run-view-meta")).toContainText("target main");
    await expect(window.locator("#managed-run-view-meta")).toContainText(baseRevision.slice(0, 12));
    await expect(window.locator("#managed-run-journey [data-task-id]")).toHaveCount(5);
    await expect(window.locator('[data-task-id="shape"]')).toContainText("ready to shape");
    await expect(window.locator('[data-task-id="spec"]')).toContainText("locked");
    await expect(window.locator("#managed-run-shape")).toHaveText("Open Shape");
    await expect(window.locator("#managed-run-generate-plan")).toBeHidden();

    expect(fs.readFileSync(path.join(sourceRepo, "local-only.txt"), "utf8")).toBe(
      "keep me\n",
    );
    expect(git(sourceRepo, ["status", "--porcelain"])).toContain("local-only.txt");
    const worktrees = git(sourceRepo, ["worktree", "list", "--porcelain"]);
    expect(worktrees).toContain("branch refs/heads/agentic/native-workflow-");
    const worktreePath = worktrees.match(/worktree (.*managed-run-worktrees[^\r\n]*)/u)?.[1];
    expect(worktreePath).toBeTruthy();
    expect(git(worktreePath, ["rev-parse", "HEAD"])).toBe(baseRevision);
    expect(fs.existsSync(path.join(worktreePath, "local-only.txt"))).toBe(false);
    fs.appendFileSync(path.join(worktreePath, "CONTEXT.md"), "\n**Shape Commit**: approved domain documentation\n", "utf8");
    expect(fs.readFileSync(path.join(sourceRepo, ".git", "info", "exclude"), "utf8"))
      .toMatch(/^\.agentic\/$/m);
    const runDirectories = fs.readdirSync(path.join(sourceRepo, ".agentic", "runs"));
    expect(runDirectories).toHaveLength(1);

    await window.evaluate(async () => {
      const context = await window.agentic.app.getContext();
      const listed = await window.agentic.managedRuns.list();
      const run = listed.runs[0];
      const started = await window.agentic.sessions.start({
        label: `Shape: ${run.title}`, command: context.defaultCommand,
        argsArray: [], cwd: run.worktreePath, cols: 120, rows: 36,
      });
      return window.agentic.managedRuns.linkShapeSession(run.id, started.session.id);
    });
    await expect(window.locator('[data-task-id="shape"]')).toContainText("conversation active");
    await window.locator("#managed-run-shape-editor").fill("# Shape\n\n## Decision\n\nUse native workers.\n");
    await window.locator("#managed-run-save-shape").click();
    await expect(window.locator("#managed-run-domain-meta")).toContainText("CONTEXT.md");
    await expect(window.locator("#managed-run-domain-meta")).toContainText("Managed Run");
    await expect(window.locator("#managed-run-domain-diff")).toContainText("Shape Commit");
    await expect(window.locator('[data-task-id="shape"]')).toContainText("approval required");
    await window.locator("#managed-run-approve-shape").click();
    const shaped = (await window.evaluate(() => window.agentic.managedRuns.list())).runs[0];
    expect(shaped.phase).toBe("spec");
    expect(shaped.approvals.shape).toMatchObject({
      summaryRevision: 1, conversationRevision: 1,
      documentationCommit: { message: "Document Shape domain decisions", paths: ["CONTEXT.md"] },
    });
    expect(fs.readFileSync(path.join(sourceRepo, "CONTEXT.md"), "utf8")).not.toContain("Shape Commit");
    expect(git(worktreePath, ["show", "--name-only", "--format=", "HEAD"])).toBe("CONTEXT.md");
    await expect(window.locator('[data-task-id="shape"]')).toContainText("approved");
    await expect(window.locator('[data-task-id="spec"]')).toContainText("current phase");
    await window.locator('[data-task-id="shape"]').click();
    await expect(window.locator("#managed-run-inspector")).toContainText("Shape evidence");
    await expect(window.locator("#managed-run-inspector")).toContainText("Document Shape domain decisions");

    await expect(window.locator('[data-task-id="spec"]')).toContainText("ready to generate");
    await window.locator("#managed-run-generate-spec").click();
    await expect(window.locator("#managed-run-spec-editor")).toHaveValue(SPEC_MARKDOWN);
    await expect(window.locator('[data-task-id="spec"]')).toContainText("approval required");
    await window.locator("#managed-run-confirm-test-seams").check();
    await window.locator("#managed-run-approve-spec").click();
    await expect(window.locator('[data-task-id="spec"]')).toContainText("approved");
    await expect(window.locator('[data-task-id="tickets"]')).toContainText("current phase");
    await window.locator('[data-task-id="spec"]').click();
    await expect(window.locator("#managed-run-inspector")).toContainText("Test seams explicitly confirmed");

    await window.locator("#managed-run-generate-tickets").click();
    await expect(window.locator("#managed-run-tickets-editor")).toHaveValue(TICKETS_MARKDOWN);
    await window.locator("#managed-run-tickets-editor").fill(TICKETS_MARKDOWN.replace("- None", "- ticket-b"));
    await window.locator("#managed-run-save-tickets").click();
    let ticketRun = (await window.evaluate(() => window.agentic.managedRuns.list())).runs[0];
    expect(ticketRun.artifacts.tickets.revision).toBe(1);
    await window.locator("#managed-run-tickets-editor").fill(TICKETS_MARKDOWN);
    await window.locator("#managed-run-save-tickets").click();
    await window.locator("#managed-run-approve-tickets").click();
    await expect(window.locator('[data-task-id="ticket-c"]')).toContainText("human review");
    ticketRun = (await window.evaluate(() => window.agentic.managedRuns.list())).runs[0];
    expect(ticketRun.approvedTicketsSnapshot).toMatchObject({ revision: 2, tickets: [{ id: "ticket-a" }, { id: "ticket-b", dependencies: ["ticket-a"] }, { id: "ticket-c", dependencies: ["ticket-b"] }] });
    expect(ticketRun.tasks[0].attempts[0]).toMatchObject({ verification: { spec: { verdict: "pass" }, standards: { verdict: "pass" }, diffFingerprint: expect.any(String) }, commit: { changedFiles: ["ticket-a-output.txt"] } });
    expect(ticketRun.tasks[1].attempts).toHaveLength(2);
    expect(ticketRun.tasks[2]).toMatchObject({ status: "human_review_required", commit: undefined });
    expect(ticketRun.tasks[2].attempts).toHaveLength(3);
    expect(git(worktreePath, ["status", "--porcelain"])).toContain("ticket-c-output.txt");
    expect(git(sourceRepo, ["rev-parse", "HEAD"])).toBe(baseRevision);
    await expect(window.locator('[data-task-id="ticket-a"]')).toContainText("verified");
    await expect(window.locator('[data-task-id="ticket-b"]')).toContainText("verified");

    await window.locator("#managed-run-spec-editor").fill(SPEC_MARKDOWN.replace("Persist and approve", "Edit and re-approve"));
    await window.locator("#managed-run-save-spec").click();
    await expect(window.locator("#managed-run-previous-spec")).toContainText("Persist and approve");
    await expect(window.locator('[data-task-id="spec"]')).toContainText("approval required");
    await expect(window.locator('[data-task-id="tickets"]')).toContainText("locked");

    const conversationPath = path.join(sourceRepo, ".agentic", "runs", runDirectories[0], "shape", "conversation-r1.txt");
    expect(fs.existsSync(conversationPath)).toBe(true);

    await window.locator("#managed-run-shape-editor").fill("# Shape\n\n## Decision\n\nUse a changed native worker boundary.\n");
    await window.locator("#managed-run-save-shape").click();
    const invalidated = (await window.evaluate(() => window.agentic.managedRuns.list())).runs[0];
    expect(invalidated).toMatchObject({ phase: "shape", status: "shape_approval_required" });
    expect(invalidated.approvals.shape).toBeNull();
    expect(invalidated.artifacts.shape.summaryRevision).toBe(2);
    await expect(window.locator('[data-task-id="shape"]')).toContainText("approval required");
    await expect(window.locator('[data-task-id="spec"]')).toContainText("locked");
  } finally {
    await electronApp.close();
  }
});
