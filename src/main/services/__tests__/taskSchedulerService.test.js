const { createTaskSchedulerService } = require("../taskSchedulerService");
const { createTokenLedgerService } = require("../tokenLedgerService");

function makeRun({ maxAttempts = 3 } = {}) {
  return {
    id: "run-1",
    repoPath: process.cwd(),
    specification: "Implement the requested behavior.",
    status: "ready",
    planRevision: 1,
    approvedRevision: 1,
    plan: {
      objective: "Implement it",
      constraints: [],
      successCriteria: ["Behavior works"],
      finalVerificationGuidance: ["Run focused tests"],
    },
    tasks: [
      {
        id: "task-1",
        title: "Implement",
        objective: "Make the focused change",
        successCriteria: ["Focused test passes"],
        dependencies: [],
        relevantScope: [],
        contextNotes: [],
        verificationGuidance: [],
        implementationTier: "standard",
        verificationTier: "standard",
        maxAttempts,
        status: "planned",
        attempts: [],
      },
    ],
    routing: {
      implementer: { provider: "codex", tier: "standard", model: "" },
      verifier: { provider: "codex", tier: "standard", model: "" },
      integration_verifier: {
        provider: "codex",
        tier: "premium",
        model: "premium-model",
      },
    },
    workers: [],
    events: [],
    usage: {
      workerCount: 0,
      premiumWorkerCount: 0,
      hasTokenData: false,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      reportedCost: 0,
    },
    finalVerification: null,
    activeWorkerId: null,
  };
}

function fakeScheduler(outputs, localOutcomes = []) {
  let sequence = 0;
  const workerProcessService = {
    run: jest.fn(({ runId, taskId, launch, prompt }) => {
      const configured = outputs[sequence++];
      const id = `worker-${sequence}`;
      return {
        workerId: id,
        completion: Promise.resolve({
          id,
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
          stdout: configured.stdout || "{}",
          stderr: configured.stderr || "",
          exitCode: configured.exitCode ?? 0,
          status: configured.status || "succeeded",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:01.000Z",
          usage: configured.usage || {},
          git: { status: "", diffStat: "", changedFiles: [] },
        }),
      };
    }),
  };
  const workerProviderRegistry = {
    buildLaunch: jest.fn(({ role, selection }) => ({
      command: "worker",
      args: [],
      preview: `worker ${role}`,
      role,
      provider: selection.provider,
      tier: selection.tier,
      model: selection.model || "",
      modelFlagUsed: Boolean(selection.model),
      permissionMode: role === "implementer" ? "workspace-write" : "read-only",
    })),
  };
  const persistence = { save: jest.fn() };
  const publishRun = jest.fn();
  const localInferenceService = {
    completeStructured: jest.fn(async () => localOutcomes.shift()),
  };
  return {
    scheduler: createTaskSchedulerService({
      workerProviderRegistry,
      workerProcessService,
      managedRunPersistenceService: persistence,
      tokenLedgerService: createTokenLedgerService(),
      localInferenceService,
      publishRun,
    }),
    workerProcessService,
    localInferenceService,
  };
}

const pass = JSON.stringify({
  verdict: "pass",
  summary: "Passed",
  checks: ["test: passed"],
  failedCriteria: [],
  feedback: "",
  risks: [],
});

describe("Managed Run deterministic scheduler", () => {
  test("implements, independently verifies, and runs final verification", async () => {
    const run = makeRun();
    const { scheduler } = fakeScheduler([
      { stdout: '{"summary":"implemented"}' },
      { stdout: pass },
      { stdout: pass },
    ]);

    await scheduler.autoRun(run);

    expect(run.tasks[0].status).toBe("succeeded");
    expect(run.tasks[0].attempts).toHaveLength(1);
    expect(run.workers.map((worker) => worker.role)).toEqual([
      "implementer",
      "verifier",
      "integration_verifier",
    ]);
    expect(run.finalVerification.verdict).toBe("pass");
    expect(run.status).toBe("review_required");
  });

  test("feeds verification failure into a bounded retry", async () => {
    const run = makeRun();
    const fixRequired = JSON.stringify({
      verdict: "fix_required",
      summary: "Needs correction",
      checks: [],
      failedCriteria: ["Focused test passes"],
      feedback: "Correct the edge case",
      risks: [],
    });
    const { scheduler, workerProcessService } = fakeScheduler([
      { stdout: "{}" },
      { stdout: fixRequired },
      { stdout: "{}" },
      { stdout: pass },
      { stdout: pass },
    ]);

    await scheduler.autoRun(run);

    expect(run.tasks[0].attempts).toHaveLength(2);
    expect(run.tasks[0].status).toBe("succeeded");
    expect(workerProcessService.run.mock.calls[2][0].prompt).toContain(
      "Correct the edge case",
    );
  });

  test("stops for human review after attempts are exhausted", async () => {
    const run = makeRun({ maxAttempts: 2 });
    const fixRequired = JSON.stringify({
      verdict: "fix_required",
      summary: "Still failing",
      checks: [],
      failedCriteria: ["Focused test passes"],
      feedback: "Try again",
      risks: [],
    });
    const { scheduler } = fakeScheduler([
      { stdout: "{}" },
      { stdout: fixRequired },
      { stdout: "{}" },
      { stdout: fixRequired },
    ]);

    await scheduler.autoRun(run);

    expect(run.tasks[0].attempts).toHaveLength(2);
    expect(run.tasks[0].status).toBe("human_review_required");
    expect(run.status).toBe("review_required");
    expect(run.finalVerification).toBeNull();
  });

  test("uses the local model only to classify malformed verifier output", async () => {
    const run = makeRun();
    const { scheduler, localInferenceService } = fakeScheduler(
      [
        { stdout: "{}" },
        { stdout: "Verifier prose without structured JSON" },
        { stdout: pass },
      ],
      [JSON.parse(pass)],
    );

    await scheduler.autoRun(run);

    expect(localInferenceService.completeStructured).toHaveBeenCalledTimes(1);
    expect(run.tasks[0].status).toBe("succeeded");
    expect(run.finalVerification.verdict).toBe("pass");
  });
});
