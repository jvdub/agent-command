const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { launchElectronApp } = require("./helpers/electronApp");

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

  const { electronApp, window } = await launchElectronApp(
    testInfo,
    "native-run-appdata",
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
