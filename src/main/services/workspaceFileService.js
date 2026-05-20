const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_EDITOR_FILE_BYTES = 1024 * 1024 * 2;

function createWorkspaceFileService({
  sessions,
  dialog,
  getMainWindow,
  resolveInitialDirectory,
}) {
  function getSessionByIdOrThrow(sessionId) {
    if (!sessionId) {
      throw new Error("A session ID is required.");
    }

    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    return session;
  }

  function sanitizeEditorRequestedPath(value) {
    let sanitized = String(value || "").trim();

    if (/^(file|vscode):\/\//i.test(sanitized)) {
      try {
        if (/^vscode:\/\/file\//i.test(sanitized)) {
          sanitized = sanitized.replace(/^vscode:\/\/file\//i, "file:///");
        }

        const fileUrl = new URL(sanitized);
        if (fileUrl.protocol === "file:") {
          sanitized = decodeURIComponent(fileUrl.pathname || "");

          if (/^\/[A-Za-z]:\//.test(sanitized)) {
            sanitized = sanitized.slice(1);
          }
        }
      } catch {
        // Fall through to best-effort text sanitization below.
      }
    }

    sanitized = sanitized
      .replace(/#L\d+(?:-L?\d+)?(?:C\d+)?$/i, "")
      .replace(/:\d+(?::\d+)?$/i, "")
      .replace(/#\d+(?:-\d+)?$/i, "")
      .replace(/^['"`[(]+/, "")
      .replace(/[)'"`\],.;:!?]+$/, "");

    if (sanitized.startsWith("a/") || sanitized.startsWith("b/")) {
      sanitized = sanitized.slice(2);
    }

    sanitized = sanitized.replace(/\\+/g, "/");

    return sanitized;
  }

  function pathWithinRoot(rootPath, candidatePath) {
    const normalizedRoot = path.resolve(rootPath);
    const normalizedCandidate = path.resolve(candidatePath);

    if (process.platform === "win32") {
      const rootLower = normalizedRoot.toLowerCase();
      const candidateLower = normalizedCandidate.toLowerCase();

      if (candidateLower === rootLower) {
        return true;
      }

      return candidateLower.startsWith(`${rootLower}${path.sep}`);
    }

    const relative = path.relative(normalizedRoot, normalizedCandidate);
    return !(relative.startsWith("..") || path.isAbsolute(relative));
  }

  function listWorkspaceFiles(rootPath, maxEntries = 20000) {
    const files = [];
    const stack = [rootPath];

    while (stack.length && files.length < maxEntries) {
      const current = stack.pop();
      let entries = [];

      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (files.length >= maxEntries) {
          break;
        }

        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (
            entry.name === ".git" ||
            entry.name === "node_modules" ||
            entry.name === ".next" ||
            entry.name === "dist" ||
            entry.name === "build"
          ) {
            continue;
          }

          stack.push(fullPath);
          continue;
        }

        if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  function listWorkspaceFileEntries(rootPath) {
    return listWorkspaceFiles(rootPath).map((filePath) => ({
      absolutePath: filePath,
      relativePath:
        path.relative(rootPath, filePath) || path.basename(filePath),
      basename: path.basename(filePath),
    }));
  }

  function getWorkspaceRootForListing(sessionId) {
    const session = sessionId ? sessions.get(sessionId) : null;
    if (
      session?.cwd &&
      fs.existsSync(session.cwd) &&
      fs.statSync(session.cwd).isDirectory()
    ) {
      return path.resolve(session.cwd);
    }

    return path.resolve(resolveInitialDirectory());
  }

  function findWorkspaceFileByFallback(workspaceRoots, variants) {
    for (const root of workspaceRoots) {
      const files = listWorkspaceFiles(root);

      for (const variant of variants) {
        const normalized = String(variant || "").replace(/\\+/g, "/");
        if (!normalized) {
          continue;
        }

        const suffix = normalized.startsWith("/")
          ? normalized
          : `/${normalized}`;

        const suffixMatches = files.filter((filePath) =>
          filePath.replace(/\\+/g, "/").endsWith(suffix),
        );

        if (suffixMatches.length === 1) {
          return {
            absolutePath: suffixMatches[0],
            workspaceRoot: root,
          };
        }

        if (normalized.includes("/")) {
          continue;
        }

        const basenameMatches = files.filter(
          (filePath) => path.basename(filePath) === normalized,
        );

        if (basenameMatches.length === 1) {
          return {
            absolutePath: basenameMatches[0],
            workspaceRoot: root,
          };
        }
      }
    }

    return null;
  }

  function ensureSessionWorkspacePath(sessionId, requestedPath) {
    if (!requestedPath || !String(requestedPath).trim()) {
      throw new Error("A file path is required.");
    }

    const session = getSessionByIdOrThrow(sessionId);
    const sessionRoot = path.resolve(session.cwd);
    const initialRoot = path.resolve(resolveInitialDirectory());
    const workspaceRoots = Array.from(new Set([sessionRoot, initialRoot]));
    const cleaned = sanitizeEditorRequestedPath(requestedPath);

    if (!cleaned) {
      throw new Error("A file path is required.");
    }

    const expandedPath = cleaned.startsWith("~/")
      ? path.join(os.homedir(), cleaned.slice(2))
      : cleaned;

    const variants = new Set([expandedPath, expandedPath.replace(/^\.\//, "")]);

    for (const root of workspaceRoots) {
      const workspaceName = path.basename(root);
      for (const variant of Array.from(variants)) {
        if (variant.startsWith(`${workspaceName}/`)) {
          variants.add(variant.slice(workspaceName.length + 1));
        }

        const marker = `/${workspaceName}/`;
        const markerIndex = variant.lastIndexOf(marker);
        if (markerIndex >= 0) {
          variants.add(variant.slice(markerIndex + marker.length));
        }
      }
    }

    const candidates = [];
    for (const variant of variants) {
      if (!variant) {
        continue;
      }

      if (path.isAbsolute(variant)) {
        candidates.push(path.resolve(variant));
        continue;
      }

      for (const root of workspaceRoots) {
        candidates.push(path.resolve(root, variant));
      }
    }

    for (const candidate of candidates) {
      const matchingRoot = workspaceRoots.find((root) =>
        pathWithinRoot(root, candidate),
      );

      if (!matchingRoot || !fs.existsSync(candidate)) {
        continue;
      }

      return {
        absolutePath: candidate,
        relativePath:
          path.relative(matchingRoot, candidate) || path.basename(candidate),
        workspaceRoot: matchingRoot,
      };
    }

    const fallback = findWorkspaceFileByFallback(workspaceRoots, variants);
    if (fallback && fs.existsSync(fallback.absolutePath)) {
      return {
        absolutePath: fallback.absolutePath,
        relativePath:
          path.relative(fallback.workspaceRoot, fallback.absolutePath) ||
          path.basename(fallback.absolutePath),
        workspaceRoot: fallback.workspaceRoot,
      };
    }

    const firstCandidate = candidates[0];
    if (!firstCandidate) {
      throw new Error("File not found in workspace.");
    }

    const allowed = workspaceRoots.some((root) =>
      pathWithinRoot(root, firstCandidate),
    );
    if (!allowed) {
      throw new Error(
        "Access denied: file path is outside the session workspace.",
      );
    }

    return {
      absolutePath: firstCandidate,
      relativePath:
        path.relative(workspaceRoots[0], firstCandidate) ||
        path.basename(firstCandidate),
      workspaceRoot: workspaceRoots[0],
    };
  }

  function assertEditableTextFile(absolutePath) {
    if (!fs.existsSync(absolutePath)) {
      throw new Error("File not found in workspace.");
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      throw new Error("Only regular files can be opened in the editor.");
    }

    if (stat.size > MAX_EDITOR_FILE_BYTES) {
      throw new Error("File is too large to open in the embedded editor.");
    }

    const sample = fs.readFileSync(absolutePath);
    if (sample.includes(0)) {
      throw new Error("Binary files are not supported in the embedded editor.");
    }
  }

  async function ensureWorkingDirectory(requestedPath) {
    const cwd =
      requestedPath && requestedPath.trim()
        ? path.resolve(requestedPath.trim())
        : process.cwd();

    if (fs.existsSync(cwd)) {
      if (!fs.statSync(cwd).isDirectory()) {
        throw new Error(`Working directory is not a folder: ${cwd}`);
      }

      return cwd;
    }

    const result = await dialog.showMessageBox(getMainWindow(), {
      type: "question",
      buttons: ["Create Directory", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: "Create Working Directory?",
      message: "The requested working directory does not exist.",
      detail: `Create this directory before starting the session?\n\n${cwd}`,
    });

    if (result.response !== 0) {
      throw new Error(
        "Session start canceled because the working directory does not exist.",
      );
    }

    fs.mkdirSync(cwd, { recursive: true });
    return cwd;
  }

  function openEditorFile(sessionId, filePath) {
    const resolved = ensureSessionWorkspacePath(sessionId, filePath);
    assertEditableTextFile(resolved.absolutePath);

    return {
      absolutePath: resolved.absolutePath,
      relativePath: resolved.relativePath,
      content: fs.readFileSync(resolved.absolutePath, "utf-8"),
    };
  }

  function listWorkspaceFilesForRoot(sessionId, requestedRoot) {
    const root = requestedRoot
      ? path.resolve(requestedRoot)
      : getWorkspaceRootForListing(sessionId);

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error("Workspace root not found.");
    }

    return {
      root,
      files: listWorkspaceFileEntries(root),
    };
  }

  function saveEditorFile(sessionId, filePath, content) {
    const resolved = ensureSessionWorkspacePath(sessionId, filePath);
    assertEditableTextFile(resolved.absolutePath);

    fs.writeFileSync(resolved.absolutePath, content, "utf-8");

    return {
      ok: true,
      savedAt: Date.now(),
      relativePath: resolved.relativePath,
    };
  }

  return {
    ensureWorkingDirectory,
    listWorkspaceFilesForRoot,
    openEditorFile,
    saveEditorFile,
  };
}

module.exports = {
  createWorkspaceFileService,
};
