const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { IPC_CHANNELS } = require("../../shared/ipcContract");
const { access, mkdir, readdir, readFile, stat, writeFile } = fs.promises;

const MAX_EDITOR_FILE_BYTES = 1024 * 1024 * 2;
const EDITOR_FILE_CHANGE_DEBOUNCE_MS = 75;
const execFileAsync = promisify(execFile);

function createWorkspaceFileService({
  sessions,
  dialog,
  getMainWindow,
  resolveInitialDirectory,
  sendToRenderer = () => {},
  watch = fs.watch,
}) {
  let editorFileWatcher = null;
  let editorFileChangeTimer = null;
  let watchedEditorFile = null;

  function stopWatchingEditorFile() {
    if (editorFileChangeTimer) {
      clearTimeout(editorFileChangeTimer);
      editorFileChangeTimer = null;
    }

    if (editorFileWatcher) {
      editorFileWatcher.close();
      editorFileWatcher = null;
    }

    watchedEditorFile = null;
  }

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
    let isUncPath = /^\\\\/.test(sanitized);

    if (/^(file|vscode):\/\//i.test(sanitized)) {
      try {
        if (/^vscode:\/\/file\//i.test(sanitized)) {
          sanitized = sanitized.replace(/^vscode:\/\/file\//i, "file:///");
        }

        const fileUrl = new URL(sanitized);
        if (fileUrl.protocol === "file:") {
          const pathname = decodeURIComponent(fileUrl.pathname || "");
          sanitized = fileUrl.host ? `//${fileUrl.host}${pathname}` : pathname;
          isUncPath = /^\/{2}[^/]/.test(sanitized);

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
    if (isUncPath && !sanitized.startsWith("//")) {
      sanitized = `/${sanitized}`;
    }

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

  async function pathExists(targetPath) {
    try {
      await access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async function listWorkspaceFiles(rootPath, maxEntries = 20000) {
    const files = [];
    const stack = [rootPath];

    while (stack.length && files.length < maxEntries) {
      const current = stack.pop();
      let entries = [];

      try {
        entries = await readdir(current, { withFileTypes: true });
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

  async function listWorkspaceFileEntries(rootPath) {
    const files = await listWorkspaceFiles(rootPath);
    return files.map((filePath) => ({
      absolutePath: filePath,
      relativePath:
        path.relative(rootPath, filePath) || path.basename(filePath),
      basename: path.basename(filePath),
    }));
  }

  async function getWorkspaceRootForListing(sessionId) {
    const session = sessionId ? sessions.get(sessionId) : null;
    if (session?.cwd && (await pathExists(session.cwd))) {
      try {
        if ((await stat(session.cwd)).isDirectory()) {
          return path.resolve(session.cwd);
        }
      } catch {
        // Fall through to initial directory.
      }
    }

    return path.resolve(resolveInitialDirectory());
  }

  async function findWorkspaceFileByFallback(workspaceRoots, variants) {
    for (const root of workspaceRoots) {
      const files = await listWorkspaceFiles(root);

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

  async function ensureSessionWorkspacePath(sessionId, requestedPath) {
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

      if (!matchingRoot || !(await pathExists(candidate))) {
        continue;
      }

      return {
        absolutePath: candidate,
        relativePath:
          path.relative(matchingRoot, candidate) || path.basename(candidate),
        workspaceRoot: matchingRoot,
      };
    }

    const fallback = await findWorkspaceFileByFallback(workspaceRoots, variants);
    if (fallback && (await pathExists(fallback.absolutePath))) {
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

  async function assertEditableTextFile(absolutePath) {
    if (!(await pathExists(absolutePath))) {
      throw new Error("File not found in workspace.");
    }

    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new Error("Only regular files can be opened in the editor.");
    }

    if (fileStat.size > MAX_EDITOR_FILE_BYTES) {
      throw new Error("File is too large to open in the embedded editor.");
    }

    const sample = await readFile(absolutePath);
    if (sample.includes(0)) {
      throw new Error("Binary files are not supported in the embedded editor.");
    }
  }

  function watchEditorFile(sessionId, resolved) {
    stopWatchingEditorFile();

    const watchedFile = {
      absolutePath: resolved.absolutePath,
      relativePath: resolved.relativePath,
      sessionId,
    };
    watchedEditorFile = watchedFile;

    const scheduleChange = () => {
      if (editorFileChangeTimer) {
        clearTimeout(editorFileChangeTimer);
      }

      editorFileChangeTimer = setTimeout(async () => {
        editorFileChangeTimer = null;

        if (watchedEditorFile !== watchedFile) {
          return;
        }

        try {
          await assertEditableTextFile(watchedFile.absolutePath);
          const content = await readFile(watchedFile.absolutePath, "utf-8");
          if (watchedEditorFile !== watchedFile) {
            return;
          }

          sendToRenderer(IPC_CHANNELS.events.workspaceFileChanged, {
            ...watchedFile,
            content,
          });
        } catch {
          if (watchedEditorFile === watchedFile) {
            sendToRenderer(IPC_CHANNELS.events.workspaceFileChanged, {
              ...watchedFile,
              deleted: true,
            });
          }
        }
      }, EDITOR_FILE_CHANGE_DEBOUNCE_MS);
    };

    try {
      editorFileWatcher = watch(
        path.dirname(watchedFile.absolutePath),
        { persistent: false },
        (_eventType, filename) => {
          if (
            filename &&
            String(filename) !== path.basename(watchedFile.absolutePath)
          ) {
            return;
          }

          scheduleChange();
        },
      );
    } catch {
      watchedEditorFile = null;
      return;
    }

    editorFileWatcher.on?.("error", stopWatchingEditorFile);
  }

  async function ensureWorkingDirectory(requestedPath) {
    const cwd =
      requestedPath && requestedPath.trim()
        ? path.resolve(requestedPath.trim())
        : process.cwd();

    if (await pathExists(cwd)) {
      if (!(await stat(cwd)).isDirectory()) {
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

    await mkdir(cwd, { recursive: true });
    return cwd;
  }

  async function openEditorFile(sessionId, filePath) {
    const resolved = await ensureSessionWorkspacePath(sessionId, filePath);
    await assertEditableTextFile(resolved.absolutePath);
    const content = await readFile(resolved.absolutePath, "utf-8");
    watchEditorFile(sessionId, resolved);

    return {
      absolutePath: resolved.absolutePath,
      relativePath: resolved.relativePath,
      content,
    };
  }

  async function listWorkspaceFilesForRoot(sessionId, requestedRoot) {
    const root = requestedRoot
      ? path.resolve(requestedRoot)
      : await getWorkspaceRootForListing(sessionId);

    if (!(await pathExists(root)) || !(await stat(root)).isDirectory()) {
      throw new Error("Workspace root not found.");
    }

    return {
      root,
      files: await listWorkspaceFileEntries(root),
    };
  }

  async function listWorkspaceChanges(sessionId) {
    const session = getSessionByIdOrThrow(sessionId);

    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "-c",
          "core.quotepath=false",
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ],
        {
          cwd: session.cwd,
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 4,
        },
      );

      const files = String(stdout || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const status = line.slice(0, 2);
          const rawPath = line.slice(3);
          const filePath = rawPath.includes(" -> ")
            ? rawPath.split(" -> ").pop()
            : rawPath;
          return { status, filePath };
        });

      return { files, supported: true };
    } catch {
      return { files: [], supported: false };
    }
  }

  async function saveEditorFile(sessionId, filePath, content) {
    const resolved = await ensureSessionWorkspacePath(sessionId, filePath);
    await assertEditableTextFile(resolved.absolutePath);

    await writeFile(resolved.absolutePath, content, "utf-8");

    return {
      ok: true,
      savedAt: Date.now(),
      relativePath: resolved.relativePath,
    };
  }

  return {
    ensureWorkingDirectory,
    listWorkspaceFilesForRoot,
    listWorkspaceChanges,
    openEditorFile,
    saveEditorFile,
    stopWatchingEditorFile,
  };
}

module.exports = {
  createWorkspaceFileService,
};
