const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const PROCESS_INSPECTION_CACHE_TTL_MS = 1500;
const BORING_PROCESSES = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "dash",
  "MainThread",
]);

function createProcessInspectionService({ sessions }) {
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
    return raw.trim()
      ? raw.trim().split(/\s+/).map(Number).filter(Boolean)
      : [];
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
    if (depth > 6) {
      return [];
    }

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

  const processProviders = {
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
    const provider = processProviders[process.platform];
    return Boolean(provider && provider.supported);
  }

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

    const visible = normalized.filter((processInfo) => {
      if (processInfo.state === "Z") {
        return false;
      }

      if (processInfo.pid === ptyPid) {
        return false;
      }

      if (BORING_PROCESSES.has(processInfo.comm)) {
        return false;
      }

      if (processInfo.comm === "node") {
        return Boolean(processInfo.cmdline && processInfo.cmdline.trim());
      }

      return true;
    });

    let filtered = visible;

    if (session.command.toLowerCase() === "copilot") {
      const nodeProcesses = visible
        .filter((processInfo) => processInfo.comm === "node")
        .sort((left, right) => left.pid - right.pid);

      const baselineNodePids = new Set(
        nodeProcesses.slice(0, 2).map((processInfo) => processInfo.pid),
      );

      filtered = visible.filter((processInfo) => {
        if (
          processInfo.comm === "node" &&
          baselineNodePids.has(processInfo.pid)
        ) {
          return false;
        }

        return (
          processInfo.comm === "node" ||
          !isCopilotInternalProcess(session, processInfo)
        );
      });
    } else {
      filtered = visible.filter(
        (processInfo) => !isCopilotInternalProcess(session, processInfo),
      );
    }

    const seen = new Set();
    return filtered.filter((processInfo) => {
      const key = `${processInfo.pid}|${processInfo.comm}|${processInfo.cmdline}`;
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

    const provider = processProviders[process.platform];
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

  return {
    getSessionChildProcesses,
    isProcessInspectionSupported,
  };
}

module.exports = {
  createProcessInspectionService,
};
