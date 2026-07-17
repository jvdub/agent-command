const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createManagedRunRetentionService } = require("../managedRunRetentionService");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "retention-"));
  const source = path.join(root, "source");
  const worktree = path.join(root, "worktree");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(source);
  const git = (cwd, args) => execFileSync(
    "git",
    ["-c", "safe.directory=" + cwd, ...args],
    { cwd, encoding: "utf8" },
  ).trim();

  git(source, ["init", "--initial-branch=main"]);
  git(source, ["config", "user.name", "Test"]);
  git(source, ["config", "user.email", "test@example.com"]);
  fs.writeFileSync(path.join(source, "base"), "base\n");
  git(source, ["add", "base"]);
  git(source, ["commit", "-m", "base"]);
  git(source, ["worktree", "add", "-b", "agentic/run", worktree, "HEAD"]);
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, "evidence.md"), "verified\n");
  fs.writeFileSync(path.join(worktree, "run"), "run\n");
  git(worktree, ["add", "run"]);
  git(worktree, ["commit", "-m", "run"]);

  const revision = git(worktree, ["rev-parse", "HEAD"]);
  return {
    source,
    worktree,
    workspace,
    git,
    revision,
    run: {
      id: "run-1",
      sourceRepoPath: source,
      worktreePath: worktree,
      runWorkspacePath: workspace,
      targetBranch: "main",
      branchName: "agentic/run",
      integration: null,
    },
  };
}

describe("Managed Run retention", () => {
  test("refuses automatic cleanup but confirmed cleanup retains unintegrated commits", async () => {
    const fixture = createFixture();
    const service = createManagedRunRetentionService();
    const preview = await service.preview(fixture.run);

    expect(preview).toMatchObject({
      safeToClean: false,
      requiresDestructiveConfirmation: true,
    });
    expect(preview.resources).toEqual([
      { kind: "worktree", path: fixture.worktree, exists: true, action: "remove" },
      { kind: "branch", ref: "refs/heads/agentic/run", revision: fixture.revision, action: "retain" },
      { kind: "run_workspace", path: fixture.workspace, exists: true, action: "remove" },
    ]);

    expect((await service.cleanup(fixture.run, { previewToken: preview.previewToken })).status)
      .toBe("destructive_confirmation_required");
    expect(fs.existsSync(fixture.worktree)).toBe(true);

    const confirmed = await service.cleanup(fixture.run, {
      previewToken: preview.previewToken,
      confirmDestructiveCleanup: true,
    });
    expect(confirmed.status).toBe("cleaned_with_retained_branch");
    expect(confirmed.retainedResources).toEqual([
      { kind: "branch", ref: "refs/heads/agentic/run", revision: fixture.revision, action: "retain" },
    ]);
    expect(fs.existsSync(fixture.worktree)).toBe(false);
    expect(fs.existsSync(fixture.workspace)).toBe(false);
    expect(fixture.git(fixture.source, ["rev-parse", "agentic/run"])).toBe(fixture.revision);
  });

  test("rejects a recorded cleanup root that contains the source checkout", async () => {
    const fixture = createFixture();
    fixture.run.runWorkspacePath = path.dirname(fixture.source);
    await expect(createManagedRunRetentionService().preview(fixture.run))
      .rejects.toThrow(/not safely isolated/);
  });

  test("removes only recorded resources after proving integration", async () => {
    const fixture = createFixture();
    fixture.git(fixture.source, ["merge", "--ff-only", "agentic/run"]);
    fixture.run.integration = {
      status: "integrated",
      targetBranch: "main",
      resultingRevision: fixture.revision,
    };
    const service = createManagedRunRetentionService();
    const preview = await service.preview(fixture.run);
    expect(preview.safeToClean).toBe(true);

    const result = await service.cleanup(fixture.run, { previewToken: preview.previewToken });
    expect(result).toMatchObject({
      status: "cleaned",
      retainedMetadata: {
        runRevision: fixture.revision,
        targetRevision: fixture.revision,
      },
    });
    expect(fs.existsSync(fixture.source)).toBe(true);
    expect(fs.existsSync(fixture.worktree)).toBe(false);
    expect(fs.existsSync(fixture.workspace)).toBe(false);
    expect(() => fixture.git(fixture.source, ["rev-parse", "agentic/run"])).toThrow();
    expect(fixture.git(fixture.source, ["rev-parse", "main"])).toBe(fixture.revision);
  });
});
