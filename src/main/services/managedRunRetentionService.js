const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function pathExists(candidate) {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}

function createManagedRunRetentionService() {
  async function git(run, args) {
    const result = await execFileAsync("git", ["-c", "safe.directory=" + run.sourceRepoPath, ...args], {
      cwd: run.sourceRepoPath,
      encoding: "utf8",
      windowsHide: true,
    });
    return result.stdout.trim();
  }

  function recordedPaths(run) {
    const source = path.resolve(run.sourceRepoPath);
    const worktree = path.resolve(run.worktreePath);
    const workspace = path.resolve(run.runWorkspacePath);
    if (
      new Set([source, worktree, workspace]).size !== 3
      || worktree === path.parse(worktree).root
      || workspace === path.parse(workspace).root
      || containsPath(worktree, source)
      || containsPath(workspace, source)
      || containsPath(worktree, workspace)
      || containsPath(workspace, worktree)
    ) {
      throw new Error("Managed Run cleanup paths are not safely isolated.");
    }
    return { source, worktree, workspace };
  }

  async function preview(run) {
    const paths = recordedPaths(run);
    let runRevision = null;
    let targetRevision = null;
    let integrated = false;
    let worktreeClean = false;
    const worktreeExists = await pathExists(paths.worktree);
    try {
      runRevision = await git(run, ["rev-parse", "refs/heads/" + run.branchName]);
      targetRevision = await git(run, ["rev-parse", "refs/heads/" + run.targetBranch]);
      try {
        await git(run, ["merge-base", "--is-ancestor", runRevision, "refs/heads/" + run.targetBranch]);
        integrated = run.integration?.status === "integrated"
          && run.integration?.targetBranch === run.targetBranch;
      } catch {
        integrated = false;
      }
      worktreeClean = !worktreeExists
        || await git(run, ["-C", paths.worktree, "status", "--porcelain"]) === "";
    } catch {
      integrated = false;
      worktreeClean = false;
    }

    const preferences = run.retentionPreferences || {
      cleanupRunWorkspace: true,
      cleanupWorktree: true,
      cleanupBranch: true,
    };
    const resources = [];
    if (preferences.cleanupWorktree !== false) {
      resources.push({ kind: "worktree", path: paths.worktree, exists: worktreeExists, action: "remove" });
    }
    if (preferences.cleanupBranch !== false) {
      resources.push({
        kind: "branch",
        ref: "refs/heads/" + run.branchName,
        revision: runRevision,
        action: integrated ? "remove" : "retain",
      });
    }
    if (preferences.cleanupRunWorkspace !== false) {
      resources.push({
        kind: "run_workspace",
        path: paths.workspace,
        exists: await pathExists(paths.workspace),
        action: "remove",
      });
    }

    const facts = { runId: run.id, resources, runRevision, targetRevision, integrated, worktreeClean };
    const safeToClean = integrated && worktreeClean;
    return {
      ...facts,
      safeToClean,
      requiresDestructiveConfirmation: !safeToClean,
      previewToken: createHash("sha256").update(JSON.stringify(facts)).digest("hex"),
    };
  }

  async function cleanup(run, options = {}) {
    const current = await preview(run);
    if (options.previewToken !== current.previewToken) return { ...current, status: "preview_changed" };
    if (!current.safeToClean && !options.confirmDestructiveCleanup) {
      return { ...current, status: "destructive_confirmation_required" };
    }
    if (!current.safeToClean && !current.worktreeClean) {
      return { ...current, status: "unsafe_cleanup_refused" };
    }

    const paths = recordedPaths(run);
    const selected = new Set(
      current.resources.filter((resource) => resource.action === "remove").map((resource) => resource.kind),
    );
    if (selected.has("worktree") && await pathExists(paths.worktree)) {
      await git(run, ["worktree", "remove", paths.worktree]);
    }
    if (selected.has("branch")) await git(run, ["branch", "-d", run.branchName]);
    if (selected.has("run_workspace") && await pathExists(paths.workspace)) {
      await fs.promises.rm(paths.workspace, { recursive: true });
    }
    return {
      status: current.safeToClean ? "cleaned" : "cleaned_with_retained_branch",
      cleanedAt: new Date().toISOString(),
      resources: current.resources.filter((resource) => resource.action === "remove"),
      retainedResources: current.resources.filter((resource) => resource.action === "retain"),
      retainedMetadata: {
        runRevision: current.runRevision,
        targetRevision: current.targetRevision,
        integration: run.integration,
      },
    };
  }

  return { preview, cleanup };
}

module.exports = { createManagedRunRetentionService };
