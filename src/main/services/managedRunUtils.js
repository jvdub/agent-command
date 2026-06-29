const { randomUUID } = require("crypto");

const RUN_TERMINAL_STATES = new Set([
  "paused",
  "replan_required",
  "review_required",
  "completed",
  "cancelled",
  "failed",
]);

function nowIso() {
  return new Date().toISOString();
}

function addRunEvent(run, message, level = "info", detail = null) {
  run.events.push({
    id: randomUUID(),
    at: nowIso(),
    level,
    message,
    detail,
  });
  run.updatedAt = nowIso();
}

function unwrapProviderOutput(raw) {
  const text = String(raw || "").trim();
  try {
    const value = JSON.parse(text);
    for (const key of ["result", "output", "content"]) {
      if (typeof value?.[key] === "string") {
        return value[key];
      }
    }
  } catch {
    // Plain worker output is expected for several providers.
  }
  return text;
}

function extractStructuredJson(raw) {
  const text = unwrapProviderOutput(raw).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    candidates.push(text.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next representation.
    }
  }

  throw new Error("Worker output did not contain a valid JSON object.");
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function validateAndNormalizePlan(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Plan must be a JSON object.");
  }

  const objective = String(input.objective || input.summary || "").trim();
  const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
  if (!objective || rawTasks.length === 0) {
    throw new Error("Plan requires an objective and at least one task.");
  }

  const ids = new Set();
  const tasks = rawTasks.map((rawTask, index) => {
    const id = String(rawTask?.id || `task-${index + 1}`).trim();
    const title = String(rawTask?.title || "").trim();
    const taskObjective = String(
      rawTask?.objective || rawTask?.description || "",
    ).trim();
    if (!id || !title || !taskObjective) {
      throw new Error(`Task ${index + 1} requires id, title, and objective.`);
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate task ID: ${id}`);
    }
    ids.add(id);

    return {
      id,
      title,
      objective: taskObjective,
      successCriteria: normalizeStringArray(rawTask.successCriteria),
      dependencies: normalizeStringArray(rawTask.dependencies),
      relevantScope: normalizeStringArray(rawTask.relevantScope),
      implementationTier: String(
        rawTask.implementationTier || "standard",
      ),
      verificationTier: String(rawTask.verificationTier || "standard"),
      verificationGuidance: normalizeStringArray(
        rawTask.verificationGuidance,
      ),
      contextNotes: normalizeStringArray(rawTask.contextNotes),
      maxAttempts: Math.min(
        10,
        Math.max(1, Number(rawTask.maxAttempts || 3)),
      ),
      order: index + 1,
      status: "planned",
      attempts: [],
    };
  });

  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(
          `Task ${task.id} references unknown dependency ${dependency}.`,
        );
      }
      if (dependency === task.id) {
        throw new Error(`Task ${task.id} cannot depend on itself.`);
      }
    }
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  function visit(taskId) {
    if (visiting.has(taskId)) {
      throw new Error(`Plan contains a dependency cycle at ${taskId}.`);
    }
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of taskById.get(taskId).dependencies) {
      visit(dependency);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  }
  for (const task of tasks) visit(task.id);

  return {
    objective,
    constraints: normalizeStringArray(input.constraints),
    nonGoals: normalizeStringArray(input.nonGoals),
    successCriteria: normalizeStringArray(input.successCriteria),
    risks: normalizeStringArray(input.risks),
    unresolvedQuestions: normalizeStringArray(input.unresolvedQuestions),
    finalVerificationGuidance: normalizeStringArray(
      input.finalVerificationGuidance,
    ),
    tasks,
  };
}

function summarizeRun(run) {
  return {
    ...run,
    workers: run.workers.map((worker) => ({
      ...worker,
      prompt: undefined,
    })),
  };
}

module.exports = {
  RUN_TERMINAL_STATES,
  addRunEvent,
  extractStructuredJson,
  nowIso,
  summarizeRun,
  unwrapProviderOutput,
  validateAndNormalizePlan,
};
