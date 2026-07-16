const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { createHash } = require("crypto");

function git(cwd, args) {
  return execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], {
    cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function targetWorktree(run) {
  const output = git(run.sourceRepoPath, ["worktree", "list", "--porcelain"]);
  const records = output.split(/\r?\n\r?\n/u).map((record) => Object.fromEntries(
    record.split(/\r?\n/u).filter(Boolean).map((line) => {
      const separator = line.indexOf(" ");
      return separator < 0 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
    }),
  ));
  const existing = records.find((record) => record.branch === `refs/heads/${run.targetBranch}`);
  if (existing?.worktree) return { path: existing.worktree, temporary: false };
  const integrationPath = path.join(run.runWorkspacePath, "target-integration-worktree");
  fs.mkdirSync(path.dirname(integrationPath), { recursive: true });
  git(run.sourceRepoPath, ["worktree", "add", integrationPath, run.targetBranch]);
  return { path: integrationPath, temporary: true };
}

function createManagedRunIntegrationService() {
  function preview(run) {
    const targetRevision = git(run.sourceRepoPath, ["rev-parse", `refs/heads/${run.targetBranch}`]);
    const runRevision = git(run.worktreePath, ["rev-parse", "HEAD"]);
    if (run.lastVerifiedCommit && runRevision !== run.lastVerifiedCommit) throw new Error("Run branch changed after final mission verification.");
    if (git(run.worktreePath, ["status", "--porcelain"])) throw new Error("Run Worktree must be clean before local integration.");
    const mergeBase = git(run.sourceRepoPath, ["merge-base", targetRevision, runRevision]);
    const targetMoved = targetRevision !== run.baseRevision;
    const mode = targetMoved ? "normal_merge" : "fast_forward";
    const previewToken = createHash("sha256").update(JSON.stringify({ targetBranch: run.targetBranch, targetRevision, runRevision, baseRevision: run.baseRevision, mergeBase, mode })).digest("hex");
    return {
      targetBranch: run.targetBranch, runBranch: run.branchName,
      targetRevision, runRevision, baseRevision: run.baseRevision, mergeBase, targetMoved, mode, previewToken,
      requiresConfirmation: targetMoved,
    };
  }

  function integrate(run, options = {}) {
    const proposed = preview(run);
    if (options.previewToken && options.previewToken !== proposed.previewToken) return { ...proposed, status: "preview_changed", requiresConfirmation: true };
    if (proposed.requiresConfirmation && (options.confirmMovedTarget !== true || options.previewToken !== proposed.previewToken)) {
      return { ...proposed, status: "confirmation_required" };
    }
    const target = targetWorktree(run);
    const currentBranch = git(target.path, ["branch", "--show-current"]);
    if (currentBranch !== run.targetBranch) throw new Error(`Target worktree is not on ${run.targetBranch}.`);
    const targetHead = git(target.path, ["rev-parse", "HEAD"]);
    if (targetHead !== proposed.targetRevision) return { ...preview(run), status: "preview_changed", requiresConfirmation: true };
    const targetStatus = git(target.path, ["status", "--porcelain"]);
    const gitDirectory = git(target.path, ["rev-parse", "--git-dir"]);
    const operationMarkers = ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD"].filter((marker) => fs.existsSync(path.resolve(target.path, gitDirectory, marker)));
    if (targetStatus || operationMarkers.length) {
      return { ...proposed, status: "target_blocked", targetWorktreePath: target.path, targetStatus: targetStatus.split(/\r?\n/u).filter(Boolean), operationMarkers };
    }
    const command = proposed.mode === "fast_forward"
      ? ["merge", "--ff-only", proposed.runRevision]
      : ["merge", "--no-ff", "--no-edit", proposed.runRevision];
    const merged = spawnSync("git", ["-c", `safe.directory=${target.path}`, ...command], {
      cwd: target.path, encoding: "utf8", windowsHide: true,
    });
    if (merged.status !== 0) {
      const conflictPaths = git(target.path, ["diff", "--name-only", "--diff-filter=U"])
        .split(/\r?\n/u).filter(Boolean).sort();
      if (conflictPaths.length) {
        return { ...proposed, status: "conflicts", conflictPaths, targetWorktreePath: target.path, detail: String(merged.stderr || merged.stdout).trim() };
      }
      throw new Error(`Local integration failed: ${String(merged.stderr || merged.stdout).trim()}`);
    }
    const resultingRevision = git(target.path, ["rev-parse", "HEAD"]);
    if (target.temporary) git(run.sourceRepoPath, ["worktree", "remove", target.path]);
    return { ...proposed, status: "integrated", resultingRevision, targetWorktreePath: target.path };
  }

  return { preview, integrate };
}

module.exports = { createManagedRunIntegrationService };
