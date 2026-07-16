const { spawn, execFile } = require("child_process");
const { randomUUID } = require("crypto");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 1_000_000;

function appendBounded(current, chunk) {
  const combined = `${current || ""}${String(chunk || "")}`;
  return combined.length <= MAX_OUTPUT_CHARS
    ? combined
    : combined.slice(-MAX_OUTPUT_CHARS);
}

function parseUsage(stdout) {
  const usage = {
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
    turns: null,
    reportedCost: null,
  };
  try {
    const value = JSON.parse(String(stdout || "").trim());
    const source = value.usage || value;
    usage.inputTokens = source.input_tokens ?? source.inputTokens ?? null;
    usage.outputTokens = source.output_tokens ?? source.outputTokens ?? null;
    usage.cachedTokens = source.cached_input_tokens ?? source.cachedTokens ?? null;
    usage.reasoningTokens =
      source.reasoning_tokens ?? source.reasoningTokens ?? null;
    usage.turns = value.num_turns ?? value.turns ?? null;
    usage.reportedCost = value.total_cost_usd ?? value.cost ?? null;
  } catch {
    // Providers do not consistently expose machine-readable usage.
  }
  return usage;
}

function buildWorkerEnvironment(source = process.env) {
  const environment = { ...source };
  // These describe the parent Codex execution sandbox, not the worker we are
  // launching. Inheriting them can make a nested Codex CLI fail to initialize
  // its own explicitly requested sandbox before it can run read commands.
  delete environment.CODEX_SANDBOX_NETWORK_DISABLED;
  delete environment.CODEX_THREAD_ID;
  return environment;
}

function createWorkerProcessService({ onOutput = () => {} } = {}) {
  const active = new Map();

  async function gitSnapshot(cwd) {
    async function run(args) {
      try {
        const result = await execFileAsync("git", args, {
          cwd,
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        return String(result.stdout || result.stderr || "").trim();
      } catch (error) {
        return String(error.stdout || error.stderr || error.message || "").trim();
      }
    }
    const [status, diffStat, changed] = await Promise.all([
      run(["status", "--short"]),
      run(["diff", "--stat"]),
      run(["diff", "--name-only"]),
    ]);
    return {
      status,
      diffStat,
      changedFiles: changed.split(/\r?\n/u).filter(Boolean),
    };
  }

  function run({ runId, taskId = null, launch, prompt, cwd, environment = {}, timeoutMs = 1800000 }) {
    const workerId = randomUUID();
    const startedAt = new Date().toISOString();
    return {
      workerId,
      completion: new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timedOut = false;
        let cancelled = false;
        let child;
        let timer = null;

        const finish = async (exitCode, error = null) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          active.delete(runId);
          const git = await gitSnapshot(cwd);
          resolve({
            id: workerId,
            runId,
            taskId,
            role: launch.role,
            provider: launch.provider,
            tier: launch.tier,
            model: launch.model,
            modelFlagUsed: launch.modelFlagUsed,
            permissionMode: launch.permissionMode,
            commandPreview: launch.preview,
            prompt,
            stdout,
            stderr: appendBounded(stderr, error ? `${error.message}\n` : ""),
            exitCode,
            status: cancelled
              ? "cancelled"
              : timedOut
                ? "timed_out"
                : exitCode === 0
                  ? "succeeded"
                  : "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
            usage: parseUsage(stdout),
            git,
          });
        };

        try {
          child = spawn(launch.command, launch.args, {
            cwd,
            shell: false,
            windowsHide: true,
            env: { ...buildWorkerEnvironment(), ...environment },
          });
          active.set(runId, {
            workerId,
            cancel() {
              cancelled = true;
              child.kill();
            },
          });
          child.stdout.on("data", (chunk) => {
            stdout = appendBounded(stdout, chunk);
            onOutput({ runId, workerId, stream: "stdout", data: String(chunk) });
          });
          child.stderr.on("data", (chunk) => {
            stderr = appendBounded(stderr, chunk);
            onOutput({ runId, workerId, stream: "stderr", data: String(chunk) });
          });
          child.stdin.on("error", (error) => {
            if (error?.code !== "EPIPE") {
              stderr = appendBounded(stderr, `${error.message}\n`);
            }
          });
          child.on("error", (error) => void finish(127, error));
          child.on("close", (code) => void finish(code ?? 1));
          child.stdin.end(prompt || "");
        } catch (error) {
          void finish(127, error);
        }

        timer = setTimeout(() => {
          timedOut = true;
          if (child) child.kill();
          void finish(124, new Error(`Worker timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    };
  }

  function cancel(runId) {
    const entry = active.get(runId);
    if (!entry) return false;
    entry.cancel();
    return true;
  }

  function hasActiveWorker(runId) {
    return active.has(runId);
  }

  return { cancel, hasActiveWorker, run };
}

module.exports = {
  MAX_OUTPUT_CHARS,
  buildWorkerEnvironment,
  createWorkerProcessService,
  parseUsage,
};
