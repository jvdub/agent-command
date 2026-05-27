const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const pty = require("node-pty");

const execFileAsync = promisify(execFile);
const MAX_EDITOR_FILE_BYTES = 1024 * 1024 * 2;

let mainWindow;
const sessions = new Map();
const manualTerminals = new Map();
const sessionStoreFile = path.join(app.getPath("userData"), "sessions.json");

function getSessionStoreFile() {
  return path.join(app.getPath("userData"), "sessions.json");
}

function ensureSessionStoreDir() {
  const dir = path.dirname(getSessionStoreFile());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSessionsFromDisk() {
  try {
    const storeFile = getSessionStoreFile();
    if (fs.existsSync(storeFile)) {
      const data = fs.readFileSync(storeFile, "utf-8");
      const stored = JSON.parse(data);
      if (Array.isArray(stored)) {
        for (const sessionData of stored) {
          sessions.set(sessionData.id, {
            id: sessionData.id,
            ptyProcess: null,
            label: sessionData.label,
            cwd: sessionData.cwd,
            command: sessionData.command,
            args: sessionData.args || [],
            outputBuffer: sessionData.outputBuffer || "",
            createdAt: sessionData.createdAt,
            isRunning: false,
            endedAt: sessionData.endedAt || null,
            exitCode: sessionData.exitCode || null,
            signal: sessionData.signal || null,
            dispose() {},
          });
        }
      }
    }
  } catch (error) {
    console.error("Failed to load sessions from disk:", error);
  }
}

function saveSessionsToDisk() {
  try {
    ensureSessionStoreDir();
    const sessionArray = Array.from(sessions.values()).map((session) => ({
      id: session.id,
      label: session.label,
      cwd: session.cwd,
      command: session.command,
      args: session.args,
      outputBuffer: session.outputBuffer,
      createdAt: session.createdAt,
      isRunning: session.isRunning,
      endedAt: session.endedAt,
      exitCode: session.exitCode,
      signal: session.signal,
    }));
    fs.writeFileSync(
      getSessionStoreFile(),
      JSON.stringify(sessionArray, null, 2),
      "utf-8",
    );
  } catch (error) {
    console.error("Failed to save sessions to disk:", error);
  }
}

function deleteSessionFromDisk(sessionId) {
  sessions.delete(sessionId);
  saveSessionsToDisk();
}

function resolveInitialDirectory() {
  const candidate = process.argv
    .slice(1)
    .find(
      (value) =>
        value &&
        !value.startsWith("-") &&
        fs.existsSync(value) &&
        fs.statSync(value).isDirectory(),
    );

  return candidate ? path.resolve(candidate) : process.cwd();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 760,
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function shellForPlatform() {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe";
  }

  return process.env.SHELL || "/bin/bash";
}

function shellArgsForPlatform() {
  // Launch the manual terminal as an interactive login-like shell so that
  // shell profiles are sourced and the PATH/EDITOR/etc. match what the user
  // gets from a normal terminal window.
  if (process.platform === "win32") {
    // Prefer PowerShell for interactive use (it can source $PROFILE and
    // resolve PATH entries that cmd.exe cannot). Fall back to the user's
    // COMSPEC only when PowerShell is absent.
    return ["-NoLogo", "-NoExit"];
  }

  if (process.platform === "darwin") {
    // macOS requires -l (login) so that /etc/profile and ~/.bash_profile /
    // ~/.zprofile are sourced, populating PATH and EDITOR.
    return ["-l"];
  }

  // Linux: most DEs launch shells as interactive non-login, matching what
  // terminals like GNOME Terminal do. Use -i to ensure interactive mode.
  return ["-i"];
}

function interactiveShellForPlatform() {
  // For the manual terminal pane we want PowerShell on Windows, not cmd.exe,
  // because PowerShell can source $PROFILE, resolve .cmd/.ps1 tool shims,
  // and handle git editor prompts correctly.
  if (process.platform === "win32") {
    return "powershell.exe";
  }

  return process.env.SHELL || "/bin/bash";
}

function buildPtyEnv(overrides = {}) {
  // Resolve a sensible EDITOR for PTY sessions. Prefer the values already
  // set in the environment, then fall back to vim (available on all three
  // platforms for most dev setups) and finally to a platform safe fallback.
  const editorFallback = process.platform === "win32" ? "notepad" : "vi";
  const editor =
    process.env.GIT_EDITOR ||
    process.env.VISUAL ||
    process.env.EDITOR ||
    editorFallback;

  return {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    ELECTRON_RUN_AS_NODE: undefined,
    // Ensure EDITOR and VISUAL are set so git, svn, etc. can open an
    // editor inside the PTY without falling back to a GUI application.
    EDITOR: editor,
    VISUAL: editor,
    // Prevent Git from trying to launch a GUI merge/diff tool.
    GIT_TERMINAL_PROMPT: "1",
    ...overrides,
  };
}

function splitArgs(value) {
  const result = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of value.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    result.push(current);
  }

  return result;
}

function quoteWindowsCmdArg(value) {
  const text = String(value || "");
  if (!text) {
    return '""';
  }

  if (!/[\s"^&|<>()%!]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildWindowsCommandLine(command, args) {
  return [command, ...args].map(quoteWindowsCmdArg).join(" ");
}

function spawnSessionPty(command, args, options) {
  try {
    return pty.spawn(command, args, options);
  } catch (error) {
    const shouldFallback =
      process.platform === "win32" &&
      error &&
      (error.code === "ENOENT" || /not found/i.test(String(error.message)));

    if (!shouldFallback) {
      throw error;
    }

    // On Windows, many CLI tools are installed as .cmd shims and require cmd.exe resolution.
    const comspec = process.env.COMSPEC || "cmd.exe";
    const commandLine = buildWindowsCommandLine(command, args);
    return pty.spawn(comspec, ["/d", "/s", "/c", commandLine], options);
  }
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

// --- Process tree (Linux /proc) ---

const PROCESS_INSPECTION_CACHE_TTL_MS = 1500;
const processInspectionCache = new Map();

function readProcFile(pid, file) {
  try {
    return fs.readFileSync(`/proc/${pid}/${file}`, "utf8");
  } catch {
    return "";
  }
}

function getDirectChildren(pid) {
  const raw = readProcFile(pid, `task/${pid}/children`);
  return raw.trim() ? raw.trim().split(/\s+/).map(Number).filter(Boolean) : [];
}

function getProcessInfo(pid) {
  const comm = readProcFile(pid, "comm").trim();
  const cmdline = readProcFile(pid, "cmdline")
    .replace(/\0/g, " ")
    .trim()
    .slice(0, 480);
  const stat = readProcFile(pid, "stat");
  const statData = parseLinuxStat(stat);
  return {
    pid,
    ppid: statData.ppid,
    comm,
    cmdline: cmdline || comm,
    state: statData.state,
  };
}

function collectDescendants(pid, depth = 0) {
  if (depth > 6) return [];
  const results = [];
  for (const child of getDirectChildren(pid)) {
    const info = getProcessInfo(child);
    if (info.comm) {
      results.push({ ...info, depth });
      results.push(...collectDescendants(child, depth + 1));
    }
  }
  return results;
}

function parseLinuxStat(stat) {
  if (!stat) {
    return { state: "?", ppid: 0 };
  }

  const markerIndex = stat.lastIndexOf(") ");
  if (markerIndex === -1) {
    return { state: "?", ppid: 0 };
  }

  const tail = stat.slice(markerIndex + 2).trim();
  const parts = tail.split(/\s+/);
  const state = parts[0] || "?";
  const ppid = Number(parts[1]) || 0;
  return { state, ppid };
}

function normalizeProviderProcess(processInfo, depth) {
  return {
    pid: Number(processInfo.pid) || 0,
    ppid: Number(processInfo.ppid) || 0,
    comm: (processInfo.comm || "").trim(),
    cmdline: (processInfo.cmdline || "").trim(),
    state: ((processInfo.state || "?").trim()[0] || "?").toUpperCase(),
    depth,
  };
}

function buildDescendantsFromFlatList(flatProcesses, rootPid) {
  const childrenByParent = new Map();

  for (const processInfo of flatProcesses) {
    const parentPid = Number(processInfo.ppid) || 0;
    const childList = childrenByParent.get(parentPid) || [];
    childList.push(processInfo);
    childrenByParent.set(parentPid, childList);
  }

  const descendants = [];
  const queue = (childrenByParent.get(rootPid) || []).map((processInfo) => ({
    processInfo,
    depth: 0,
  }));
  const seen = new Set();

  while (queue.length) {
    const { processInfo, depth } = queue.shift();
    const pid = Number(processInfo.pid) || 0;

    if (!pid || seen.has(pid)) {
      continue;
    }

    seen.add(pid);
    descendants.push(normalizeProviderProcess(processInfo, depth));

    const children = childrenByParent.get(pid) || [];
    for (const child of children) {
      queue.push({ processInfo: child, depth: depth + 1 });
    }
  }

  return descendants;
}

async function listMacProcesses() {
  const { stdout } = await execFileAsync(
    "ps",
    ["-axo", "pid=,ppid=,state=,comm=,command="],
    { maxBuffer: 8 * 1024 * 1024 },
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
      if (!match) {
        return null;
      }

      const [, pid, ppid, state, comm, cmdline] = match;
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        comm,
        cmdline: cmdline || comm,
        state,
      };
    })
    .filter(Boolean);
}

async function listWindowsProcesses() {
  const command =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { maxBuffer: 16 * 1024 * 1024 },
  );

  const raw = stdout.trim();
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map((entry) => ({
    pid: Number(entry.ProcessId) || 0,
    ppid: Number(entry.ParentProcessId) || 0,
    comm: (entry.Name || "").trim(),
    cmdline: (entry.CommandLine || entry.Name || "").trim(),
    state: "?",
  }));
}

const PROCESS_PROVIDERS = {
  linux: {
    supported: true,
    async listDescendants(rootPid) {
      return collectDescendants(rootPid);
    },
  },
  darwin: {
    supported: true,
    async listDescendants(rootPid) {
      const flatProcesses = await listMacProcesses();
      return buildDescendantsFromFlatList(flatProcesses, rootPid);
    },
  },
  win32: {
    supported: true,
    async listDescendants(rootPid) {
      const flatProcesses = await listWindowsProcesses();
      return buildDescendantsFromFlatList(flatProcesses, rootPid);
    },
  },
};

function getCachedProcessInspection(cacheKey) {
  const cached = processInspectionCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > PROCESS_INSPECTION_CACHE_TTL_MS) {
    processInspectionCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedProcessInspection(cacheKey, value) {
  processInspectionCache.set(cacheKey, {
    timestamp: Date.now(),
    value,
  });
}

function isProcessInspectionSupported() {
  const provider = PROCESS_PROVIDERS[process.platform];
  return Boolean(provider && provider.supported);
}

// Names that are just plumbing and not interesting to surface
const BORING_PROCESSES = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "dash",
  "MainThread",
]);

function isCopilotInternalProcess(session, processInfo) {
  if (session.command.toLowerCase() !== "copilot") {
    return false;
  }

  const cmdline = (processInfo.cmdline || "").toLowerCase();
  const isCopilotPath =
    cmdline.includes("github.copilot-chat") ||
    cmdline.includes("/extensions/github.copilot") ||
    cmdline.includes("/copilotcli/") ||
    cmdline.includes("copilotclishim.js") ||
    cmdline.includes("@github/copilot") ||
    cmdline.includes("copilot-linux") ||
    cmdline.includes("/bin/copilot");

  const isInternalNodeHelper = processInfo.comm === "node" && isCopilotPath;

  return (
    isInternalNodeHelper ||
    processInfo.comm === "MainThread" ||
    isCopilotPath ||
    cmdline.includes(" copilot --") ||
    cmdline.endsWith(" copilot")
  );
}

function filterSessionChildProcesses(session, ptyPid, all) {
  const normalized = all.map((processInfo) =>
    normalizeProviderProcess(processInfo, processInfo.depth || 0),
  );

  const visible = normalized.filter((p) => {
    if (p.state === "Z") return false;
    if (p.pid === ptyPid) return false;
    if (BORING_PROCESSES.has(p.comm)) return false;

    // Keep node entries unless they are explicitly filtered below.
    if (p.comm === "node") {
      return Boolean(p.cmdline && p.cmdline.trim());
    }

    return true;
  });

  let filtered = visible;

  if (session.command.toLowerCase() === "copilot") {
    const nodeProcesses = visible
      .filter((p) => p.comm === "node")
      .sort((left, right) => left.pid - right.pid);

    // Copilot sessions consistently keep two helper node processes alive.
    // Hide only that baseline pair so additional spawned processes still show.
    const baselineNodePids = new Set(
      nodeProcesses.slice(0, 2).map((processInfo) => processInfo.pid),
    );

    filtered = visible.filter((p) => {
      if (p.comm === "node" && baselineNodePids.has(p.pid)) {
        return false;
      }

      // Keep non-node processes unless they are explicit Copilot internals.
      return p.comm === "node" || !isCopilotInternalProcess(session, p);
    });
  } else {
    filtered = visible.filter((p) => !isCopilotInternalProcess(session, p));
  }

  // Deduplicate exact duplicates by cmdline and process name while preserving pid-distinct entries.
  const seen = new Set();
  return filtered.filter((p) => {
    const key = `${p.pid}|${p.comm}|${p.cmdline}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getSessionChildProcesses(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.isRunning || !session.ptyProcess?.pid) {
    return { processes: [], supported: isProcessInspectionSupported() };
  }

  const provider = PROCESS_PROVIDERS[process.platform];
  if (!provider || !provider.supported) {
    return { processes: [], supported: false };
  }

  const ptyPid = session.ptyProcess.pid;
  const cacheKey = `${process.platform}:${ptyPid}`;
  const cached = getCachedProcessInspection(cacheKey);
  if (cached) {
    return {
      processes: filterSessionChildProcesses(session, ptyPid, cached),
      supported: true,
    };
  }

  try {
    const all = await provider.listDescendants(ptyPid);
    setCachedProcessInspection(cacheKey, all);

    return {
      processes: filterSessionChildProcesses(session, ptyPid, all),
      supported: true,
    };
  } catch (error) {
    console.warn("Process inspection provider failed:", error);
    return { processes: [], supported: false };
  }
}

function createSessionId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function buildSessionSummary(session) {
  return {
    id: session.id,
    label: session.label || "",
    cwd: session.cwd,
    command: session.command,
    args: session.args,
    outputBuffer: session.outputBuffer,
    isRunning: session.isRunning,
    createdAt: session.createdAt,
    endedAt: session.endedAt || null,
    exitCode: session.exitCode,
    signal: session.signal,
  };
}

function listSessions() {
  return Array.from(sessions.values())
    .sort((left, right) => right.createdAt - left.createdAt)
    .map(buildSessionSummary);
}

function publishSessionsChanged() {
  sendToRenderer("sessions:changed", listSessions());
}

function stopSessionById(sessionId) {
  const session = sessions.get(sessionId);

  if (!session || !session.isRunning) {
    return false;
  }

  session.ptyProcess.kill();
  return true;
}

function stopAllSessions() {
  for (const session of sessions.values()) {
    if (session.isRunning) {
      session.ptyProcess.kill();
    }
  }

  for (const terminal of manualTerminals.values()) {
    if (terminal.isRunning) {
      terminal.ptyProcess.kill();
    }
  }
}

function getManualTerminalKey(sessionId, terminalId = "1") {
  return `${sessionId}:${terminalId}`;
}

function startManualTerminal(session, terminalId = "1") {
  const cols = 120;
  const rows = 36;
  const shell = interactiveShellForPlatform();
  const shellArgs = shellArgsForPlatform();
  const key = getManualTerminalKey(session.id, terminalId);
  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: session.cwd,
    env: buildPtyEnv(),
  });

  const cleanup = [];

  const terminalState = {
    key,
    sessionId: session.id,
    terminalId,
    cwd: session.cwd,
    shell,
    ptyProcess,
    isRunning: true,
    outputBuffer: "",
    dispose() {
      while (cleanup.length) {
        const handler = cleanup.pop();
        if (typeof handler === "function") {
          handler();
        }
      }
    },
  };

  cleanup.push(
    ptyProcess.onData((data) => {
      const existing = manualTerminals.get(key);
      if (!existing) {
        return;
      }

      existing.outputBuffer += data;
      sendToRenderer("manual-terminal:data", {
        sessionId: session.id,
        terminalId,
        data,
      });
    }),
  );

  cleanup.push(
    ptyProcess.onExit((event) => {
      const existing = manualTerminals.get(key);
      if (!existing) {
        return;
      }

      existing.isRunning = false;
      sendToRenderer("manual-terminal:exit", {
        sessionId: session.id,
        terminalId,
        exitCode: event.exitCode,
        signal: event.signal || null,
      });
      existing.dispose();
    }),
  );

  manualTerminals.set(key, terminalState);
  return terminalState;
}

function ensureManualTerminal(sessionId, terminalId = "1") {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("No session found for manual terminal.");
  }

  const key = getManualTerminalKey(sessionId, terminalId);
  const existing = manualTerminals.get(key);
  if (existing) {
    return existing;
  }

  return startManualTerminal(session, terminalId);
}

function stopManualTerminalBySessionId(sessionId) {
  for (const [key, terminal] of manualTerminals.entries()) {
    if (terminal.sessionId !== sessionId) {
      continue;
    }

    if (terminal.isRunning) {
      terminal.ptyProcess.kill();
    }

    terminal.dispose();
    manualTerminals.delete(key);
  }
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

  // Handle file URIs produced by some tools/editors.
  if (/^(file|vscode):\/\//i.test(sanitized)) {
    try {
      if (/^vscode:\/\/file\//i.test(sanitized)) {
        sanitized = sanitized.replace(/^vscode:\/\/file\//i, "file:///");
      }

      const fileUrl = new URL(sanitized);
      if (fileUrl.protocol === "file:") {
        sanitized = decodeURIComponent(fileUrl.pathname || "");

        // file:///C:/path -> C:/path on Windows
        if (/^\/[A-Za-z]:\//.test(sanitized)) {
          sanitized = sanitized.slice(1);
        }
      }
    } catch {
      // Fall through to best-effort text sanitization below.
    }
  }

  // Handle common markdown/file-reference suffixes like file.ts:12,
  // file.ts:12:3, file.ts#L12, file.ts#L12-L18.
  sanitized = sanitized
    .replace(/#L\d+(?:-L?\d+)?(?:C\d+)?$/i, "")
    .replace(/:\d+(?::\d+)?$/i, "")
    .replace(/#\d+(?:-\d+)?$/i, "")
    .replace(/^['"`[(]+/, "")
    .replace(/[)'"`\],.;:!?]+$/, "");

  // Support git-style diff prefixes.
  if (sanitized.startsWith("a/") || sanitized.startsWith("b/")) {
    sanitized = sanitized.slice(2);
  }

  // Normalize windows separators from tool output.
  sanitized = sanitized.replace(/\\+/g, "/");

  return sanitized;
}

function pathWithinRoot(rootPath, candidatePath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedCandidate = path.resolve(candidatePath);

  // Windows filesystems are typically case-insensitive; compare on lowercase.
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

function findWorkspaceFileByFallback(workspaceRoots, variants) {
  for (const root of workspaceRoots) {
    const files = listWorkspaceFiles(root);

    for (const variant of variants) {
      const normalized = String(variant || "").replace(/\\+/g, "/");
      if (!normalized) {
        continue;
      }

      const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;

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

    if (!matchingRoot) {
      continue;
    }

    if (!fs.existsSync(candidate)) {
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

  const result = await dialog.showMessageBox(mainWindow, {
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

function startSession(options, cwd) {
  const command = options.command.trim();
  const label = options.label?.trim() || "";
  const args = Array.isArray(options.argsArray)
    ? options.argsArray
    : splitArgs(options.args || "");
  const cols = Number.isFinite(options.cols) ? options.cols : 120;
  const rows = Number.isFinite(options.rows) ? options.rows : 36;
  const id = options.sessionId || createSessionId();
  const createdAt =
    typeof options.createdAt === "number" ? options.createdAt : Date.now();

  const ptyOptions = {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: buildPtyEnv(),
  };

  const ptyProcess = spawnSessionPty(command, args, ptyOptions);

  const cleanup = [];

  cleanup.push(
    ptyProcess.onData((data) => {
      const session = sessions.get(id);
      if (session) {
        session.outputBuffer += data;
      }

      sendToRenderer("session:data", { sessionId: id, data });
    }),
  );

  cleanup.push(
    ptyProcess.onExit((event) => {
      const session = sessions.get(id);

      if (!session) {
        return;
      }

      session.isRunning = false;
      session.endedAt = Date.now();
      session.exitCode = event.exitCode;
      session.signal = event.signal || null;

      sendToRenderer("session:exit", {
        sessionId: id,
        exitCode: event.exitCode,
        signal: event.signal || null,
      });

      session.dispose();
      stopManualTerminalBySessionId(id);
      saveSessionsToDisk();
      publishSessionsChanged();
    }),
  );

  const session = {
    id,
    ptyProcess,
    label,
    cwd,
    command,
    args,
    outputBuffer: "",
    createdAt,
    isRunning: true,
    endedAt: null,
    exitCode: null,
    signal: null,
    dispose() {
      while (cleanup.length) {
        const handler = cleanup.pop();
        if (typeof handler === "function") {
          handler();
        }
      }
    },
  };

  sessions.set(id, session);
  saveSessionsToDisk();
  publishSessionsChanged();

  return buildSessionSummary(session);
}

app.whenReady().then(() => {
  loadSessionsFromDisk();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopAllSessions();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("dialog:pickDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    defaultPath: resolveInitialDirectory(),
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("app:getContext", async () => ({
  cwd: resolveInitialDirectory(),
  homeDirectory: os.homedir(),
  shell: shellForPlatform(),
  platform: process.platform,
  processInspectionSupported: isProcessInspectionSupported(),
}));

ipcMain.handle("session:start", async (_event, options) => {
  if (!options?.command || !options.command.trim()) {
    throw new Error("A command is required to start a session.");
  }

  const cwd = await ensureWorkingDirectory(options.cwd);
  try {
    const session = startSession(options, cwd);
    return {
      session,
      shell: shellForPlatform(),
      homeDirectory: os.homedir(),
    };
  } catch (error) {
    const message = String(error?.message || "Unable to start session.");
    if (process.platform === "win32" && /not found|enoent/i.test(message)) {
      throw new Error(
        `Command not found: ${options.command.trim()}. On Windows, confirm the CLI is installed and available in PATH for this app process.`,
      );
    }

    throw error;
  }
});

ipcMain.handle("sessions:list", async () => ({
  sessions: listSessions(),
}));

ipcMain.handle("session:stop", async (_event, sessionId) => {
  if (!sessionId) {
    throw new Error("A session ID is required.");
  }

  const stopped = stopSessionById(sessionId);
  return { stopped };
});

ipcMain.handle("session:restart", async (_event, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || session.isRunning) {
    throw new Error("Cannot restart a running session or nonexistent session.");
  }

  const restartedSession = startSession(
    {
      label: session.label,
      command: session.command,
      argsArray: session.args,
      cwd: session.cwd,
      sessionId: session.id,
      createdAt: session.createdAt,
    },
    session.cwd,
  );

  return {
    session: restartedSession,
    shell: shellForPlatform(),
    homeDirectory: os.homedir(),
  };
});

ipcMain.handle("session:remove", async (_event, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  if (session.isRunning) {
    stopSessionById(sessionId);
  }

  deleteSessionFromDisk(sessionId);
  publishSessionsChanged();
  return { removed: true };
});

ipcMain.handle("editor:openFile", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const filePath = payload?.filePath;

  try {
    const resolved = ensureSessionWorkspacePath(sessionId, filePath);

    assertEditableTextFile(resolved.absolutePath);

    const content = fs.readFileSync(resolved.absolutePath, "utf-8");

    return {
      absolutePath: resolved.absolutePath,
      relativePath: resolved.relativePath,
      content,
    };
  } catch (error) {
    const detail = String(filePath || "").slice(0, 220);
    throw new Error(
      `${error?.message || "Unable to open file."} (reference: ${detail || "<empty>"})`,
    );
  }
});

ipcMain.handle("editor:saveFile", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const filePath = payload?.filePath;
  const content = payload?.content;

  if (typeof content !== "string") {
    throw new Error("Editor content must be a string.");
  }

  const resolved = ensureSessionWorkspacePath(sessionId, filePath);
  assertEditableTextFile(resolved.absolutePath);

  fs.writeFileSync(resolved.absolutePath, content, "utf-8");

  return {
    ok: true,
    savedAt: Date.now(),
    relativePath: resolved.relativePath,
  };
});

ipcMain.handle("session:write", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const input = payload?.input;

  if (!sessionId) {
    throw new Error("A session ID is required.");
  }

  const session = sessions.get(sessionId);
  if (!session || !session.isRunning) {
    throw new Error("No active session.");
  }

  session.ptyProcess.write(input);
  return { ok: true };
});

ipcMain.handle("session:resize", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const cols = payload?.cols;
  const rows = payload?.rows;

  if (!sessionId) {
    return { ok: false };
  }

  const session = sessions.get(sessionId);
  if (!session || !session.isRunning) {
    return { ok: false };
  }

  session.ptyProcess.resize(cols, rows);
  return { ok: true };
});

ipcMain.handle("session:processes", async (_event, sessionId) => {
  if (!sessionId) {
    return {
      processes: [],
      supported: isProcessInspectionSupported(),
    };
  }

  return getSessionChildProcesses(sessionId);
});

ipcMain.handle("manual-terminal:ensure", async (_event, payload) => {
  const sessionId = typeof payload === "string" ? payload : payload?.sessionId;
  const terminalId =
    typeof payload === "string" ? "1" : String(payload?.terminalId || "1");

  if (!sessionId) {
    throw new Error("A session ID is required.");
  }

  const terminal = ensureManualTerminal(sessionId, terminalId);
  return {
    cwd: terminal.cwd,
    shell: terminal.shell,
    terminalId: terminal.terminalId,
    isRunning: terminal.isRunning,
    outputBuffer: terminal.outputBuffer,
  };
});

ipcMain.handle("manual-terminal:write", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const terminalId = String(payload?.terminalId || "1");
  const input = payload?.input;

  if (!sessionId) {
    throw new Error("A session ID is required.");
  }

  const terminal = ensureManualTerminal(sessionId, terminalId);
  if (!terminal.isRunning) {
    throw new Error("Manual terminal is not running.");
  }

  terminal.ptyProcess.write(input || "");
  return { ok: true };
});

ipcMain.handle("manual-terminal:resize", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const terminalId = String(payload?.terminalId || "1");
  const cols = payload?.cols;
  const rows = payload?.rows;

  if (!sessionId) {
    return { ok: false };
  }

  const terminal = ensureManualTerminal(sessionId, terminalId);
  if (!terminal.isRunning) {
    return { ok: false };
  }

  terminal.ptyProcess.resize(cols, rows);
  return { ok: true };
});

ipcMain.handle("external-link:open", async (_event, payload) => {
  const rawUrl = String(payload?.url || "").trim();
  if (!rawUrl) {
    throw new Error("A URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("Only http and https links are allowed.");
  }

  await shell.openExternal(parsed.toString());
  return { ok: true };
});
