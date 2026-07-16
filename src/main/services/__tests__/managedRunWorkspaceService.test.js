const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createManagedRunWorkspaceService } = require("../managedRunWorkspaceService");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

describe("Managed Run workspace creation", () => {
  let root;
  let sourceRepo;
  let worktreeRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "managed-run-workspace-"));
    sourceRepo = path.join(root, "source");
    worktreeRoot = path.join(root, "worktrees");
    fs.mkdirSync(sourceRepo, { recursive: true });
    git(sourceRepo, ["init", "--initial-branch=main"]);
    git(sourceRepo, ["config", "user.email", "managed-run@example.com"]);
    git(sourceRepo, ["config", "user.name", "Managed Run Test"]);
    fs.writeFileSync(path.join(sourceRepo, "README.md"), "# Source\n", "utf8");
    git(sourceRepo, ["add", "README.md"]);
    git(sourceRepo, ["commit", "-m", "Initial commit"]);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("creates an isolated Shape workspace from committed HEAD", () => {
    fs.writeFileSync(path.join(sourceRepo, "local-only.txt"), "uncommitted\n", "utf8");
    const workspace = createManagedRunWorkspaceService({ worktreeRoot }).create({
      runId: "019f-run-id",
      title: "Native workflow",
      sourceRepoPath: sourceRepo,
    });

    expect(workspace).toMatchObject({
      sourceRepoPath: sourceRepo,
      baseBranch: "main",
      branchName: "agentic/native-workflow-019f-run",
      sourceWasDirty: true,
      runWorkspacePath: path.join(sourceRepo, ".agentic", "runs", "019f-run-id"),
    });
    expect(workspace.baseRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(fs.existsSync(workspace.runWorkspacePath)).toBe(true);
    expect(fs.existsSync(path.join(workspace.worktreePath, "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(workspace.worktreePath, "local-only.txt"))).toBe(false);
    expect(git(workspace.worktreePath, ["branch", "--show-current"])).toBe(workspace.branchName);
    expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(workspace.baseRevision);
    expect(fs.readFileSync(path.join(sourceRepo, ".git", "info", "exclude"), "utf8"))
      .toMatch(/^\.agentic\/$/m);
  });

  test("honors a custom artifact workspace without excluding it", () => {
    const customWorkspace = path.join(root, "tracked-run-artifacts");
    const workspace = createManagedRunWorkspaceService({ worktreeRoot }).create({
      runId: "run-2",
      title: "Tracked artifacts",
      sourceRepoPath: sourceRepo,
      runWorkspacePath: customWorkspace,
      trackRunWorkspace: true,
    });

    expect(workspace.runWorkspacePath).toBe(customWorkspace);
    expect(fs.existsSync(customWorkspace)).toBe(true);
    expect(fs.readFileSync(path.join(sourceRepo, ".git", "info", "exclude"), "utf8"))
      .not.toMatch(/^\.agentic\/$/m);
  });
});
