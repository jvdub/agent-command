const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function runGit(cwd, args) {
  try {
    return execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`Git ${args[0]} failed: ${detail}`);
  }
}

function slugify(value) {
  return String(value || "managed-run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "managed-run";
}

function appendLocalExclude(sourceRepoPath, entry) {
  const commonDirValue = runGit(sourceRepoPath, ["rev-parse", "--git-common-dir"]);
  const commonDir = path.resolve(sourceRepoPath, commonDirValue);
  const excludePath = path.join(commonDir, "info", "exclude");
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const current = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, "utf8")
    : "";
  const lines = current.split(/\r?\n/u).map((line) => line.trim());
  if (!lines.includes(entry)) {
    const prefix = current && !current.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(excludePath, `${prefix}${entry}\n`, "utf8");
  }
}

function createManagedRunWorkspaceService({ worktreeRoot }) {
  if (!worktreeRoot) throw new Error("Managed Run worktree root is required.");

  function inspect(sourceRepoPath, baseRef = "HEAD") {
    const sourcePath = path.resolve(String(sourceRepoPath || "").trim());
    const requestedBase = String(baseRef || "HEAD").trim();
    const baseRevision = runGit(sourcePath, ["rev-parse", requestedBase]);
    const resolvedBranch = runGit(sourcePath, ["rev-parse", "--abbrev-ref", requestedBase]);
    const baseBranch = resolvedBranch === "HEAD" ? null : resolvedBranch;
    return {
      sourceRepoPath: sourcePath,
      baseRevision,
      baseBranch,
      sourceWasDirty: Boolean(runGit(sourcePath, ["status", "--porcelain"])),
    };
  }

  function create(input) {
    const repository = inspect(input.sourceRepoPath, input.baseRef);
    const shortId = slugify(String(input.runId).slice(0, 8));
    const branchName = input.branchName || `agentic/${slugify(input.title)}-${shortId}`;
    const worktreePath = path.join(path.resolve(worktreeRoot), String(input.runId));
    const requestedWorkspace = String(input.runWorkspacePath || "").trim();
    const runWorkspacePath = requestedWorkspace
      ? path.resolve(repository.sourceRepoPath, requestedWorkspace)
      : path.join(repository.sourceRepoPath, ".agentic", "runs", String(input.runId));

    if (!input.trackRunWorkspace) {
      const relativeWorkspace = path.relative(repository.sourceRepoPath, runWorkspacePath);
      const isRepositoryLocal = relativeWorkspace &&
        !relativeWorkspace.startsWith(`..${path.sep}`) &&
        relativeWorkspace !== ".." &&
        !path.isAbsolute(relativeWorkspace);
      if (!requestedWorkspace) {
        appendLocalExclude(repository.sourceRepoPath, ".agentic/");
      } else if (isRepositoryLocal) {
        appendLocalExclude(
          repository.sourceRepoPath,
          `${relativeWorkspace.split(path.sep).join("/")}/`,
        );
      }
    }
    fs.mkdirSync(runWorkspacePath, { recursive: true });
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
    runGit(repository.sourceRepoPath, [
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
      repository.baseRevision,
    ]);

    return {
      ...repository,
      branchName,
      worktreePath,
      runWorkspacePath,
      trackRunWorkspace: Boolean(input.trackRunWorkspace),
    };
  }

  return { create, inspect };
}

module.exports = {
  createManagedRunWorkspaceService,
  slugify,
};
