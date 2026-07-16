const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createManagedRunIntegrationService } = require("../managedRunIntegrationService");

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-integration-"));
  const source = path.join(root, "source"); const runWorktree = path.join(root, "run");
  fs.mkdirSync(source);
  const git = (cwd, args) => execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], { cwd, encoding: "utf8" }).trim();
  git(source, ["init", "--initial-branch=main"]); git(source, ["config", "user.name", "Integration Test"]); git(source, ["config", "user.email", "integration@example.com"]);
  fs.writeFileSync(path.join(source, "shared.txt"), "base\n"); git(source, ["add", "shared.txt"]); git(source, ["commit", "-m", "base"]);
  const baseRevision = git(source, ["rev-parse", "HEAD"]);
  git(source, ["worktree", "add", "-b", "agentic/run", runWorktree, baseRevision]);
  const commit = (cwd, file, content, message) => { fs.writeFileSync(path.join(cwd, file), content); git(cwd, ["add", file]); git(cwd, ["commit", "-m", message]); return git(cwd, ["rev-parse", "HEAD"]); };
  const run = { sourceRepoPath: source, worktreePath: runWorktree, runWorkspacePath: path.join(source, ".agentic", "runs", "run-1"), targetBranch: "main", branchName: "agentic/run", baseRevision };
  fs.mkdirSync(run.runWorkspacePath, { recursive: true });
  return { root, source, runWorktree, git, commit, run, baseRevision };
}

describe("Managed Run local integration", () => {
  test("fast-forwards an unchanged target and never updates its remote", () => {
    const fixture = repository(); const remote = path.join(fixture.root, "remote.git");
    fixture.git(fixture.source, ["init", "--bare", remote]); fixture.git(fixture.source, ["remote", "add", "origin", remote]); fixture.git(fixture.source, ["push", "origin", "main"]);
    const runRevision = fixture.commit(fixture.runWorktree, "run.txt", "verified\n", "verified run");
    const service = createManagedRunIntegrationService();
    expect(service.preview(fixture.run)).toMatchObject({ mode: "fast_forward", targetMoved: false, targetRevision: fixture.baseRevision, runRevision });
    const result = service.integrate(fixture.run);
    expect(result).toMatchObject({ status: "integrated", mode: "fast_forward", resultingRevision: runRevision });
    expect(fixture.git(fixture.source, ["rev-parse", "main"])).toBe(runRevision);
    expect(fixture.git(fixture.source, ["ls-remote", "origin", "refs/heads/main"]).split(/\s/u)[0]).toBe(fixture.baseRevision);
  });

  test("requires confirmation before a normal merge when the target moved", () => {
    const fixture = repository();
    const targetRevision = fixture.commit(fixture.source, "target.txt", "target\n", "target moved");
    const runRevision = fixture.commit(fixture.runWorktree, "run.txt", "run\n", "verified run");
    const service = createManagedRunIntegrationService();
    expect(service.preview(fixture.run)).toMatchObject({ mode: "normal_merge", targetMoved: true, targetRevision, runRevision });
    expect(service.integrate(fixture.run)).toMatchObject({ status: "confirmation_required", mode: "normal_merge" });
    expect(fixture.git(fixture.source, ["rev-parse", "main"])).toBe(targetRevision);
    const confirmed = service.preview(fixture.run);
    const result = service.integrate(fixture.run, { confirmMovedTarget: true, previewToken: confirmed.previewToken });
    expect(result).toMatchObject({ status: "integrated", mode: "normal_merge", targetRevision, runRevision });
    expect(fixture.git(fixture.source, ["rev-list", "--parents", "-n", "1", result.resultingRevision]).split(" ")).toHaveLength(3);
  });

  test("leaves merge conflicts visible without resolving or rewriting history", () => {
    const fixture = repository();
    fixture.commit(fixture.source, "shared.txt", "target\n", "target conflict");
    fixture.commit(fixture.runWorktree, "shared.txt", "run\n", "run conflict");
    const before = fixture.git(fixture.source, ["rev-parse", "main"]);
    const service = createManagedRunIntegrationService(); const preview = service.preview(fixture.run);
    const result = service.integrate(fixture.run, { confirmMovedTarget: true, previewToken: preview.previewToken });
    expect(result).toMatchObject({ status: "conflicts", mode: "normal_merge", conflictPaths: ["shared.txt"] });
    expect(fs.existsSync(path.join(fixture.source, ".git", "MERGE_HEAD"))).toBe(true);
    expect(fixture.git(fixture.source, ["rev-parse", "main"])).toBe(before);
    expect(fs.readFileSync(path.join(fixture.source, "shared.txt"), "utf8")).toContain("<<<<<<< HEAD");
  });

  test("rejects a stale confirmation when the target moves after preview", () => {
    const fixture = repository(); fixture.commit(fixture.source, "target.txt", "one\n", "target one");
    const runRevision = fixture.commit(fixture.runWorktree, "run.txt", "run\n", "verified run");
    const service = createManagedRunIntegrationService(); const approved = service.preview(fixture.run);
    const latestTarget = fixture.commit(fixture.source, "later.txt", "later\n", "target moved again");
    const result = service.integrate(fixture.run, { confirmMovedTarget: true, previewToken: approved.previewToken });
    expect(result).toMatchObject({ status: "preview_changed", requiresConfirmation: true, targetRevision: latestTarget, runRevision });
    expect(fixture.git(fixture.source, ["rev-parse", "main"])).toBe(latestTarget);
  });

  test("blocks a dirty target worktree without touching its changes", () => {
    const fixture = repository(); const runRevision = fixture.commit(fixture.runWorktree, "run.txt", "run\n", "verified run");
    fs.writeFileSync(path.join(fixture.source, "local.txt"), "keep me\n");
    const service = createManagedRunIntegrationService(); const preview = service.preview(fixture.run);
    const result = service.integrate(fixture.run, { previewToken: preview.previewToken });
    expect(result).toMatchObject({ status: "target_blocked", targetRevision: fixture.baseRevision, runRevision, targetStatus: ["?? local.txt"] });
    expect(fs.readFileSync(path.join(fixture.source, "local.txt"), "utf8")).toBe("keep me\n");
    expect(fixture.git(fixture.source, ["rev-parse", "main"])).toBe(fixture.baseRevision);
  });

});
