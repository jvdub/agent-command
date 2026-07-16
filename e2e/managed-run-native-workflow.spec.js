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
  git(sourceRepo, ["add", "README.md"]);
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
    await expect(window.locator("#managed-run-current-action")).toContainText(
      "Shape the idea",
    );
    await expect(window.locator("#managed-run-journey [data-task-id]")).toHaveCount(5);
    await expect(window.locator('[data-task-id="shape"]')).toContainText("current phase");
    await expect(window.locator('[data-task-id="spec"]')).toContainText("locked");
    await expect(window.locator("#managed-run-shape")).toHaveText("Open Shape");
    await expect(window.locator("#managed-run-generate-plan")).toBeHidden();

    expect(fs.readFileSync(path.join(sourceRepo, "local-only.txt"), "utf8")).toBe(
      "keep me\n",
    );
    expect(git(sourceRepo, ["status", "--porcelain"])).toContain("local-only.txt");
    const worktrees = git(sourceRepo, ["worktree", "list", "--porcelain"]);
    expect(worktrees).toContain("branch refs/heads/agentic/native-workflow-");
    const runDirectories = fs.readdirSync(path.join(sourceRepo, ".agentic", "runs"));
    expect(runDirectories).toHaveLength(1);
  } finally {
    await electronApp.close();
  }
});
