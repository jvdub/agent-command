const ATTENTION_PRIORITY = Object.freeze({ critical: 0, warning: 1, action: 2 });

function isNativeWorkflow(run) {
  return run?.workflowKind === "native";
}

function prettyStatus(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function taskPhase(task) {
  const phases = {
    planned: "queued",
    blocked_by_dependency: "blocked",
    implementing: "implementing",
    awaiting_verification: "verification queued",
    verifying: "verifying",
    retry_required: "retry queued",
    human_review_required: "human review",
    replan_required: "replan required",
    succeeded: "verified",
    failed: "failed",
    cancelled: "cancelled",
  };
  return phases[task?.status] || prettyStatus(task?.status);
}

function taskDefinition(run, taskId) {
  const snapshot = run?.approvedPlanSnapshot;
  return snapshot?.tasks?.find((task) => task.id === taskId) ||
    run?.plan?.tasks?.find((task) => task.id === taskId) ||
    run?.tasks?.find((task) => task.id === taskId) || null;
}

function attemptSegments(task) {
  const segments = [];
  for (const attempt of task?.attempts || []) {
    segments.push({
      kind: "implementation",
      attemptNumber: attempt.number,
      workerId: attempt.implementationWorkerId,
      state: attempt.verification ? "completed" : taskPhase(task),
    });
    if (attempt.verificationWorkerId || attempt.verification) {
      segments.push({
        kind: "verification",
        attemptNumber: attempt.number,
        workerId: attempt.verificationWorkerId,
        verdict: attempt.verification?.verdict || null,
        state: attempt.verification?.verdict || "running",
      });
    }
    if (attempt.verification?.verdict === "fix_required") {
      segments.push({ kind: "retry", attemptNumber: attempt.number + 1 });
    }
  }
  return segments;
}

function runProgress(run) {
  const total = run?.tasks?.length || 0;
  const verified = run?.tasks?.filter((task) => task.status === "succeeded").length || 0;
  const attempts = run?.tasks?.reduce((sum, task) => sum + (task.attempts?.length || 0), 0) || 0;
  const retries = run?.tasks?.reduce(
    (sum, task) => sum + Math.max(0, (task.attempts?.length || 0) - 1),
    0,
  ) || 0;
  return { total, verified, attempts, retries };
}

function currentAction(run) {
  if (!run) return "Select a Managed Run.";
  if (isNativeWorkflow(run) && run.phase === "shape") {
    return "Shape the idea and confirm shared understanding.";
  }
  if (run.status === "approval_required") return "Review and approve the goal plan.";
  if (run.status === "replan_required") return "Revise the plan before execution can continue.";
  if (run.status === "final_verification") return "Final integration verification is running.";
  if (run.status === "review_required" && run.finalVerification?.verdict === "pass") {
    return "Review the verified goal and accept the result.";
  }
  const activeWorker = run.workers?.find((worker) => worker.id === run.activeWorkerId);
  const activeTask = run.tasks?.find((task) => task.id === activeWorker?.taskId) ||
    run.tasks?.find((task) => ["implementing", "awaiting_verification", "verifying"].includes(task.status));
  if (activeTask) return `${activeTask.id}: ${taskPhase(activeTask)}.`;
  const attentionTask = run.tasks?.find((task) =>
    ["human_review_required", "replan_required", "failed"].includes(task.status));
  if (attentionTask) return `${attentionTask.id}: ${taskPhase(attentionTask)}.`;
  const next = run.tasks?.find((task) => ["planned", "retry_required"].includes(task.status));
  if (next) return `${next.id}: ${taskPhase(next)}.`;
  if (run.status === "completed") return "Goal completed and accepted.";
  if (run.status === "cancelled") return "Goal cancelled.";
  return prettyStatus(run.status);
}

function journeyStations(run) {
  if (isNativeWorkflow(run)) {
    const phases = [
      ["shape", "Shape"],
      ["spec", "Spec"],
      ["tickets", "Tickets"],
      ["implement", "Implement"],
      ["accept", "Accept"],
    ];
    const currentIndex = Math.max(0, phases.findIndex(([id]) => id === run.phase));
    return phases.map(([id, title], index) => ({
      id,
      kind: "workflow-phase",
      title,
      order: index + 1,
      status: index < currentIndex ? "succeeded" : index === currentIndex ? "active" : "locked",
      phase: index < currentIndex ? "approved" : index === currentIndex ? "current phase" : "locked",
      dependencies: index === 0 ? [] : [phases[index - 1][0]],
      attempts: 0,
      segments: [],
    }));
  }
  const stations = (run?.tasks || []).map((task) => ({
    id: task.id,
    kind: "task",
    title: task.title,
    order: task.order,
    status: task.status,
    phase: taskPhase(task),
    dependencies: [...(task.dependencies || [])],
    attempts: task.attempts?.length || 0,
    maxAttempts: task.maxAttempts,
    segments: attemptSegments(task),
    latestVerdict: task.attempts?.at(-1)?.verification?.verdict || null,
  }));
  stations.push({
    id: "final-verification",
    kind: "final-verification",
    title: "Integration verification",
    status: run?.status === "final_verification"
      ? "running"
      : run?.finalVerification?.verdict ||
        ((run?.tasks || []).every((task) => task.status === "succeeded") ? "ready" : "locked"),
    phase: run?.finalVerification?.verdict === "pass" ? "verified" : "integration verification",
    dependencies: (run?.tasks || []).map((task) => task.id),
    attempts: run?.finalVerification ? 1 : 0,
    segments: [],
  });
  return stations;
}

function attentionItems(run) {
  if (!run || run.archived) return [];
  const items = [];
  const add = (type, priority, label, target = {}) => items.push({
    id: `${run.id}:${type}:${target.taskId || "run"}:${target.attemptNumber || 0}`,
    runId: run.id,
    type,
    priority,
    label,
    ...target,
  });
  if (run.status === "approval_required") {
    add("approval_required", "action", "Plan awaiting approval", { section: "plan" });
  }
  for (const task of run.tasks || []) {
    if (task.status === "replan_required") {
      add("replan_required", "critical", `${task.id} requires replanning`, { taskId: task.id, section: "approved-task" });
    } else if (["human_review_required", "failed"].includes(task.status)) {
      add("human_review_required", "warning", `${task.id} requires review`, {
        taskId: task.id,
        attemptNumber: task.attempts?.at(-1)?.number,
        section: "evidence",
      });
    }
  }
  if (run.status === "review_required" && run.finalVerification?.verdict === "pass") {
    add("acceptance_required", "action", "Verified goal awaiting acceptance", {
      taskId: "final-verification",
      section: "evidence",
    });
  } else if (run.status === "review_required" && run.finalVerification) {
    add("final_review_required", "warning", "Final verification requires review", {
      taskId: "final-verification",
      section: "evidence",
    });
  }
  return items.sort((a, b) => ATTENTION_PRIORITY[a.priority] - ATTENTION_PRIORITY[b.priority]);
}

export {
  attentionItems,
  isNativeWorkflow,
  attemptSegments,
  currentAction,
  journeyStations,
  prettyStatus,
  runProgress,
  taskDefinition,
  taskPhase,
};
