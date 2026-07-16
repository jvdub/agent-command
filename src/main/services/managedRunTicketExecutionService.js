const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function git(cwd, args) {
  try {
    const result = await execFileAsync("git", ["-c", `safe.directory=${cwd}`, ...args], {
      cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024,
    });
    return String(result.stdout || "").trim();
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim();
    throw new Error(`Git ${args[0]} failed: ${detail}`);
  }
}

function uniqueSorted(lines) {
  return [...new Set(String(lines || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))].sort();
}

async function commitMessage(cwd, ticket) {
  const guidanceFiles = ["AGENTS.md", "CONTRIBUTING.md", path.join(".github", "CONTRIBUTING.md"), "package.json", "commitlint.config.js", "commitlint.config.cjs"];
  for (const relativePath of guidanceFiles) {
    try {
      const content = await fs.promises.readFile(path.join(cwd, relativePath), "utf8");
      const explicit = content.match(/commit message (?:pattern|format)\s*[:=]\s*[`"]([^`"\r\n]+)[`"]?/iu)?.[1];
      if (explicit) {
        const resolved = explicit
          .replace(/\{ticket(?:Id)?\}|<ticket(?:-id)?>|\[ticket(?:-id)?\]/giu, ticket.id || ticket.ticketId)
          .replace(/\{title\}|<description>|\[description\]/giu, ticket.title)
          .replace(/<type>|\{type\}|\[type\]/giu, "feat");
        if (resolved !== explicit || !/[<{[]/u.test(resolved)) return resolved;
      }
      if (/imperative mood/iu.test(content)) return ticket.title;
      if (/conventional commits|commitlint|(?:feat|fix|docs|test|refactor|chore)(?:\([^)]+\))?!?:\s*(?:<|\{|\[)/iu.test(content)) return `feat: ${ticket.title}`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const recent = String(await git(cwd, ["log", "-5", "--pretty=%s"])).split(/\r?\n/u).filter(Boolean);
  const conventional = recent.filter((message) => /^(?:feat|fix|docs|test|refactor|chore|build|ci|perf)(?:\([^)]+\))?!?: /u.test(message));
  if (conventional.length >= Math.max(2, Math.ceil(recent.length / 2))) return `feat: ${ticket.title}`;
  return ticket.title;
}

function createManagedRunTicketExecutionService() {
  async function capture(cwd) {
    const [headRevision, refs, trackedDiff, trackedFiles, untrackedOutput] = await Promise.all([
      git(cwd, ["rev-parse", "HEAD"]),
      git(cwd, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes", "refs/tags"]),
      git(cwd, ["diff", "--binary", "HEAD", "--"]),
      git(cwd, ["diff", "--name-only", "HEAD", "--"]),
      git(cwd, ["ls-files", "--others", "--exclude-standard"]),
    ]);
    const untrackedFiles = uniqueSorted(untrackedOutput);
    const untrackedEvidence = [];
    for (const relativePath of untrackedFiles) {
      const target = path.join(cwd, relativePath);
      const stat = await fs.promises.lstat(target);
      const content = stat.isSymbolicLink() ? Buffer.from(await fs.promises.readlink(target)) : await fs.promises.readFile(target);
      untrackedEvidence.push(`${relativePath}\0${stat.mode & 0o7777}\0${stat.isSymbolicLink() ? "symlink" : "file"}\0${createHash("sha256").update(content).digest("hex")}`);
    }
    const changedFiles = uniqueSorted(`${trackedFiles}\n${untrackedFiles.join("\n")}`);
    const fingerprint = createHash("sha256")
      .update(`${headRevision}\0${trackedDiff}\0${untrackedEvidence.join("\0")}`)
      .digest("hex");
    return { headRevision, refsFingerprint: createHash("sha256").update(refs).digest("hex"), fingerprint, changedFiles };
  }

  async function assertCleanBase(cwd, expectedRevision) {
    const snapshot = await capture(cwd);
    if (snapshot.headRevision !== expectedRevision) throw new Error("Run Worktree is not at the previous verified commit.");
    if (snapshot.changedFiles.length) throw new Error("Run Worktree must be clean before a Ticket begins.");
    return snapshot;
  }

  async function commitReviewed(cwd, reviewedFingerprint, ticket) {
    const current = await capture(cwd);
    if (current.fingerprint !== reviewedFingerprint) throw new Error("The change set changed after verification; reverification is required.");
    if (!current.changedFiles.length) throw new Error("A verified Ticket has no changes to commit.");
    await git(cwd, ["add", "-A", "--"]);
    const reviewedTree = await git(cwd, ["write-tree"]);
    const message = await commitMessage(cwd, ticket);
    await git(cwd, ["commit", "-m", message]);
    const revision = await git(cwd, ["rev-parse", "HEAD"]);
    const committedTree = await git(cwd, ["rev-parse", `${revision}^{tree}`]);
    const changedFiles = uniqueSorted(await git(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", revision]));
    if (JSON.stringify(changedFiles) !== JSON.stringify(current.changedFiles) || committedTree !== reviewedTree) throw new Error("Ticket Commit contents do not exactly match the reviewed change set.");
    return { revision, message, changedFiles, reviewedFingerprint, reviewedTree };
  }

  async function workerEnvironment(runWorkspacePath) {
    const directory = path.join(runWorkspacePath, "worker-guard");
    await fs.promises.mkdir(directory, { recursive: true });
    const pathEntries = String(process.env.PATH || "").split(path.delimiter);
    const gitBinary = process.platform === "win32"
      ? String((await execFileAsync("where.exe", ["git.exe"], { windowsHide: true })).stdout).split(/\r?\n/u)[0].trim()
      : String((await execFileAsync("which", ["git"])).stdout).trim();
    const blocked = "commit push reset clean rebase merge checkout switch branch tag update-ref reflog cherry-pick revert";
    if (process.platform === "win32") {
      const script = `@echo off\r\nfor %%C in (${blocked}) do if /I "%1"=="%%C" (echo Agentic Command blocks worker git %1 1>&2 & exit /b 77)\r\n"${gitBinary}" %*\r\n`;
      await fs.promises.writeFile(path.join(directory, "git.cmd"), script, "utf8");
    } else {
      const script = `#!/bin/sh\ncase " $blocked " in *" $1 "*) echo "Agentic Command blocks worker git $1" >&2; exit 77;; esac\nexec "${gitBinary}" "$@"\n`;
      const target = path.join(directory, "git");
      await fs.promises.writeFile(target, script, { encoding: "utf8", mode: 0o700 });
      await fs.promises.chmod(target, 0o700);
    }
    const hookScript = "#!/bin/sh\necho 'Agentic Command blocks worker-owned Git writes' >&2\nexit 77\n";
    for (const hook of ["pre-commit", "pre-push"]) {
      const hookPath = path.join(directory, hook);
      await fs.promises.writeFile(hookPath, hookScript, { encoding: "utf8", mode: 0o700 });
      if (process.platform !== "win32") await fs.promises.chmod(hookPath, 0o700);
    }
    return {
      PATH: [directory, ...pathEntries].join(path.delimiter),
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: directory,
      GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "",
      HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1",
      ALL_PROXY: "http://127.0.0.1:1", NO_PROXY: "",
    };
  }

  async function writeEvidence(runWorkspacePath, ticket, attempt) {
    const directory = path.join(runWorkspacePath, "tickets", "evidence");
    await fs.promises.mkdir(directory, { recursive: true });
    const relativePath = `tickets/evidence/${ticket.id}-attempt-${attempt.number}.json`;
    const evidence = {
      ticketId: ticket.id, attempt: attempt.number,
      tdd: {
        policy: ticket.tddPolicy, exception: ticket.tddException,
        red: attempt.artifacts.redEvidence, green: attempt.artifacts.greenEvidence,
        alternative: attempt.artifacts.alternativeVerificationEvidence,
      },
      reviewedDiff: attempt.reviewedDiff,
      verification: attempt.verification,
      commit: attempt.commit,
    };
    await fs.promises.writeFile(path.join(runWorkspacePath, relativePath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return relativePath;
  }

  return { assertCleanBase, capture, commitReviewed, workerEnvironment, writeEvidence };
}

module.exports = { createManagedRunTicketExecutionService };
