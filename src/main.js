const path = require("path");
const fs = require("fs");
const os = require("os");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const pty = require("node-pty");

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
    fs.writeFileSync(getSessionStoreFile(), JSON.stringify(sessionArray, null, 2), "utf-8");
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
    return process.env.COMSPEC || "powershell.exe";
  }

  return process.env.SHELL || "/bin/bash";
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

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

// --- Process tree (Linux /proc) ---

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
  const state = stat ? stat.split(" ")[2] : "?";
  return { pid, comm, cmdline: cmdline || comm, state };
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

function getSessionChildProcesses(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.isRunning || !session.ptyProcess?.pid) {
    return [];
  }

  const ptyPid = session.ptyProcess.pid;
  const all = collectDescendants(ptyPid);

  const visible = all.filter((p) => {
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

function startManualTerminal(session) {
  const cols = 120;
  const rows = 36;
  const shell = shellForPlatform();
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: session.cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      ELECTRON_RUN_AS_NODE: undefined,
    },
  });

  const cleanup = [];

  const terminalState = {
    sessionId: session.id,
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
      const existing = manualTerminals.get(session.id);
      if (!existing) {
        return;
      }

      existing.outputBuffer += data;
      sendToRenderer("manual-terminal:data", { sessionId: session.id, data });
    }),
  );

  cleanup.push(
    ptyProcess.onExit((event) => {
      const existing = manualTerminals.get(session.id);
      if (!existing) {
        return;
      }

      existing.isRunning = false;
      sendToRenderer("manual-terminal:exit", {
        sessionId: session.id,
        exitCode: event.exitCode,
        signal: event.signal || null,
      });
      existing.dispose();
    }),
  );

  manualTerminals.set(session.id, terminalState);
  return terminalState;
}

function ensureManualTerminal(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("No session found for manual terminal.");
  }

  const existing = manualTerminals.get(sessionId);
  if (existing) {
    return existing;
  }

  return startManualTerminal(session);
}

function stopManualTerminalBySessionId(sessionId) {
  const terminal = manualTerminals.get(sessionId);
  if (!terminal) {
    return;
  }

  if (terminal.isRunning) {
    terminal.ptyProcess.kill();
  }

  terminal.dispose();
  manualTerminals.delete(sessionId);
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

  const ptyProcess = pty.spawn(command, args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      ELECTRON_RUN_AS_NODE: undefined,
    },
  });

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
}));

ipcMain.handle("session:start", async (_event, options) => {
  if (!options?.command || !options.command.trim()) {
    throw new Error("A command is required to start a session.");
  }

  const cwd = await ensureWorkingDirectory(options.cwd);
  const session = startSession(options, cwd);
  return {
    session,
    shell: shellForPlatform(),
    homeDirectory: os.homedir(),
  };
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
    return { processes: [] };
  }

  return { processes: getSessionChildProcesses(sessionId) };
});

ipcMain.handle("manual-terminal:ensure", async (_event, sessionId) => {
  if (!sessionId) {
    throw new Error("A session ID is required.");
  }

  const terminal = ensureManualTerminal(sessionId);
  return {
    cwd: terminal.cwd,
    shell: terminal.shell,
    isRunning: terminal.isRunning,
    outputBuffer: terminal.outputBuffer,
  };
});

ipcMain.handle("manual-terminal:write", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const input = payload?.input;

  if (!sessionId) {
    throw new Error("A session ID is required.");
  }

  const terminal = ensureManualTerminal(sessionId);
  if (!terminal.isRunning) {
    throw new Error("Manual terminal is not running.");
  }

  terminal.ptyProcess.write(input || "");
  return { ok: true };
});

ipcMain.handle("manual-terminal:resize", async (_event, payload) => {
  const sessionId = payload?.sessionId;
  const cols = payload?.cols;
  const rows = payload?.rows;

  if (!sessionId) {
    return { ok: false };
  }

  const terminal = ensureManualTerminal(sessionId);
  if (!terminal.isRunning) {
    return { ok: false };
  }

  terminal.ptyProcess.resize(cols, rows);
  return { ok: true };
});
