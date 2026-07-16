const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { execFileSync } = require("child_process");

function git(cwd, args) {
  try {
    return execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], {
      cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`Git ${args[0]} failed: ${error.stderr?.toString().trim() || error.message}`);
  }
}

function normalized(relativePath) {
  return String(relativePath || "").replaceAll("\\", "/").replace(/^\.\//u, "");
}

function isDomainDocument(relativePath) {
  const value = normalized(relativePath).toLowerCase();
  const name = path.posix.basename(value);
  if (![".md", ".mdx", ".txt"].includes(path.posix.extname(name))) return false;
  if (["context.md", "domain.md", "domain-model.md", "glossary.md", "ubiquitous-language.md"].includes(name)) return true;
  return /^(docs\/)?(adr|adrs|decisions|decision-records|architecture\/(decisions|decision-records))\//u.test(value) ||
    /^(docs\/)?(domain|glossary|ubiquitous-language)(\/|\.)/u.test(value);
}

function statusPaths(cwd) {
  return git(cwd, ["status", "--porcelain", "-uall"])
    .split(/\r?\n/u).filter(Boolean)
    .map((line) => normalized(line.slice(3).replace(/^"|"$/gu, "")));
}

function createShapeDomainDocumentService() {
  function inspect(cwd) {
    const tracked = git(cwd, ["ls-files"]).split(/\r?\n/u).filter(Boolean).map(normalized);
    const recognizedPaths = tracked.filter(isDomainDocument).sort();
    const canonicalTerms = [];
    for (const relativePath of recognizedPaths) {
      const target = path.join(cwd, relativePath);
      if (!fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, "utf8");
      for (const match of content.matchAll(/^\*\*([^*]+)\*\*\s*(?::|—|-)\s*/gmu)) canonicalTerms.push(match[1].trim());
      for (const match of content.matchAll(/^#{2,4}\s+(.+)$/gmu)) {
        const term = match[1].replace(/[`*_]/gu, "").trim();
        if (!/^(language|glossary|domain|decisions|architecture)$/iu.test(term)) canonicalTerms.push(term);
      }
      for (const line of content.split(/\r?\n/u)) {
        const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
        if (cells.length >= 2 && !/^[-: ]+$/u.test(cells[0]) && !/^(term|name)$/iu.test(cells[0])) canonicalTerms.push(cells[0].replace(/[`*_]/gu, ""));
      }
    }
    return { hasConvention: recognizedPaths.length > 0, recognizedPaths, canonicalTerms: [...new Set(canonicalTerms)] };
  }

  function rejectUnauthorizedChanges(cwd, options = {}) {
    const changedPaths = statusPaths(cwd);
    const convention = inspect(cwd);
    const rejectedPaths = changedPaths.filter((relativePath) =>
      !isDomainDocument(relativePath) || (!convention.hasConvention && options.allowNewConvention !== true),
    );
    if (!rejectedPaths.length) return [];
    const tracked = new Set(git(cwd, ["ls-files"]).split(/\r?\n/u).filter(Boolean).map(normalized));
    for (const relativePath of rejectedPaths) {
      if (tracked.has(relativePath)) {
        git(cwd, ["restore", "--source=HEAD", "--staged", "--worktree", "--", relativePath]);
      } else {
        const absolutePath = path.resolve(cwd, relativePath);
        const root = `${path.resolve(cwd)}${path.sep}`;
        if (!absolutePath.startsWith(root)) throw new Error("Refusing to restore a path outside the Run Worktree.");
        fs.rmSync(absolutePath, { recursive: true, force: true });
      }
    }
    return rejectedPaths;
  }

  const guards = new Map();
  function stopGuard(cwd) {
    const guard = guards.get(path.resolve(cwd));
    if (!guard) return false;
    clearTimeout(guard.timer);
    guard.watcher.close();
    guards.delete(path.resolve(cwd));
    return true;
  }

  function startGuard(cwd, onRejected = () => {}, options = {}) {
    const root = path.resolve(cwd);
    const existing = guards.get(root);
    const optionKey = JSON.stringify(options);
    if (existing?.optionKey === optionKey) return { guarded: true };
    stopGuard(cwd);
    const guard = { timer: null, watcher: null, optionKey };
    const enforce = () => {
      clearTimeout(guard.timer);
      guard.timer = setTimeout(() => {
        try {
          const rejected = rejectUnauthorizedChanges(root, options);
          if (rejected.length) onRejected(rejected, null);
        } catch (error) {
          stopGuard(root);
          onRejected([], error);
        }
      }, 20);
    };
    guard.watcher = fs.watch(root, { recursive: true }, enforce);
    guard.watcher.unref?.();
    guards.set(root, guard);
    return { guarded: true };
  }

  function preview(cwd, options = {}) {
    const changedPaths = statusPaths(cwd);
    const convention = inspect(cwd);
    const trackedPaths = new Set(git(cwd, ["ls-files"]).split(/\r?\n/u).filter(Boolean).map(normalized));
    const rejectedPaths = rejectUnauthorizedChanges(cwd, options);
    if (rejectedPaths.length) {
      if (!convention.hasConvention && options.allowNewConvention !== true && rejectedPaths.every(isDomainDocument)) {
        throw new Error(`${rejectedPaths.join(", ")} was rejected and restored; keep proposed material in the Run Workspace until project documentation is approved.`);
      }
      throw new Error(`${rejectedPaths.join(", ")} was rejected and restored because Shape may write only recognized glossary and architecture-decision documentation.`);
    }
    const sections = changedPaths.sort().map((relativePath) => {
      const absolutePath = path.join(cwd, relativePath);
      const tracked = trackedPaths.has(relativePath);
      if (tracked) return git(cwd, ["diff", "HEAD", "--", relativePath]);
      return `diff --git a/${relativePath} b/${relativePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relativePath}\n@@ proposed @@\n${fs.readFileSync(absolutePath, "utf8").split(/\r?\n/u).map((line) => `+${line}`).join("\n")}\n`;
    });
    const diff = sections.join("\n");
    return {
      changedPaths,
      diff,
      fingerprint: createHash("sha256").update(diff).digest("hex"),
      inspectedAt: new Date().toISOString(),
    };
  }

  function saveProposal(runWorkspacePath, markdown) {
    const directory = path.join(runWorkspacePath, "shape");
    fs.mkdirSync(directory, { recursive: true });
    const proposalPath = path.join(directory, "domain-proposal.md");
    fs.writeFileSync(proposalPath, `${String(markdown || "").trim()}\n`, "utf8");
    return { proposalPath: "shape/domain-proposal.md" };
  }

  function materializeProposal(cwd, runWorkspacePath, approved) {
    const proposalPath = path.join(runWorkspacePath, "shape", "domain-proposal.md");
    if (!approved || !fs.existsSync(proposalPath) || inspect(cwd).hasConvention) return { materialized: false };
    const target = path.join(cwd, "docs", "domain.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(proposalPath, target);
    return { materialized: true, path: "docs/domain.md" };
  }

  function documentedMessage(cwd) {
    for (const relativePath of ["AGENTS.md", "CONTRIBUTING.md", ".github/CONTRIBUTING.md"]) {
      const target = path.join(cwd, relativePath);
      if (!fs.existsSync(target)) continue;
      for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/u)) {
        const match = line.match(/commit message(?: format)?\s*[:=]\s*[`"]([^`"]+)[`"]?/iu);
        if (match) return match[1].replace(/<[^>]+>/gu, "record Shape domain decisions");
      }
    }
    for (const relativePath of ["commitlint.config.js", "commitlint.config.cjs", "commitlint.config.mjs", ".commitlintrc", ".commitlintrc.json", ".commitlintrc.yml"]) {
      if (fs.existsSync(path.join(cwd, relativePath))) return "docs: record Shape domain decisions";
    }
    for (const relativePath of ["AGENTS.md", "CONTRIBUTING.md", ".github/CONTRIBUTING.md"]) {
      const target = path.join(cwd, relativePath);
      if (!fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, "utf8");
      if (/conventional commits|(?:feat|fix|docs)(?:\([^)]*\))?:\s*[<[{]/iu.test(content)) return "docs: record Shape domain decisions";
      const requiredPrefix = content.match(/commit messages?[^.\n]*(?:start|begin|prefix)[^.\n]*(?:with|is)\s*[`"]?([^`"\s.,;]+)/iu)?.[1];
      if (requiredPrefix) return `${requiredPrefix} Record Shape domain decisions`;
      const bracketed = content.match(/commit messages?[^.\n]*(\[[A-Z][A-Z0-9_-]+\])/u)?.[1];
      if (bracketed) return `${bracketed} Record Shape domain decisions`;
      if (/commit messages?[^.\n]*(imperative|sentence case|present tense)/iu.test(content)) return "Document Shape domain decisions";
    }
    return null;
  }

  function commitMessage(cwd) {
    const documented = documentedMessage(cwd);
    if (documented) return documented;
    const subjects = git(cwd, ["log", "-20", "--pretty=%s"]).split(/\r?\n/u).filter(Boolean);
    if (subjects.some((subject) => /^(feat|fix|docs|refactor|test|chore)(\([^)]*\))?!?:\s/u.test(subject))) {
      return "docs: record Shape domain decisions";
    }
    return "Document Shape domain decisions";
  }

  function commitApproved(cwd, approvedFingerprint, options = {}) {
    const current = preview(cwd, options);
    if (current.fingerprint !== approvedFingerprint) throw new Error("Shape documentation changed after review; refresh the diff before approval.");
    if (!current.changedPaths.length) return null;
    const message = commitMessage(cwd);
    git(cwd, ["add", "--", ...current.changedPaths]);
    try {
      git(cwd, ["commit", "--only", "-m", message, "--", ...current.changedPaths]);
    } catch (error) {
      git(cwd, ["-c", "user.name=Agentic Command", "-c", "user.email=agentic-command@local", "commit", "--only", "-m", message, "--", ...current.changedPaths]);
    }
    return { fingerprint: approvedFingerprint, message, revision: git(cwd, ["rev-parse", "HEAD"]).trim(), paths: current.changedPaths };
  }

  return { commitApproved, inspect, materializeProposal, preview, rejectUnauthorizedChanges, saveProposal, startGuard, stopGuard };
}

module.exports = { createShapeDomainDocumentService, isDomainDocument };
