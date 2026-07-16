const { createTaskSchedulerService } = require("../taskSchedulerService");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createTokenLedgerService } = require("../tokenLedgerService");
const { createManagedRunTicketExecutionService } = require("../managedRunTicketExecutionService");

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
      configured.effect?.();
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
        }).then((result) => { configured.afterResolve?.(); return result; }),
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
      managedRunTicketExecutionService: createManagedRunTicketExecutionService(),
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
  test("routes a Spec defect back to the earliest authoring phase", async () => {
    const run = makeRun();
    const defect = JSON.stringify({
      verdict: "spec_defect", summary: "The acceptance rule is contradictory",
      feedback: "Revise the Spec", checks: [], failedCriteria: ["Behavior works"], risks: [],
    });
    const { scheduler } = fakeScheduler([
      { stdout: '{"summary":"implemented","changedFiles":[],"checks":["manual"],"risks":[]}' },
      { stdout: defect },
    ]);

    await scheduler.autoRun(run);

    expect(run.phase).toBe("spec");
    expect(run.status).toBe("spec_revision_required");
    expect(run.tasks[0].status).toBe("revision_required");
    expect(run.revisionRequest).toMatchObject({ targetPhase: "spec", verdict: "spec_defect" });
  });

  test("implements, independently verifies, and runs final verification", async () => {
    const run = makeRun();
    const { scheduler } = fakeScheduler([
      { stdout: '{"summary":"implemented","changedFiles":["src/feature.js"],"checks":["npm test: pass"],"risks":[]}' },
      { stdout: pass },
      { stdout: pass },
    ]);

    await scheduler.autoRun(run);

    expect(run.tasks[0].status).toBe("succeeded");
    expect(run.tasks[0].attempts).toHaveLength(1);
    expect(run.tasks[0].attempts[0].artifacts).toMatchObject({
      parseStatus: "parsed",
      reportedFiles: ["src/feature.js"],
      checks: ["npm test: pass"],
    });
    expect(run.workers.map((worker) => worker.role)).toEqual([
      "implementer",
      "verifier",
      "integration_verifier",
    ]);
    expect(run.finalVerification.verdict).toBe("pass");
    expect(run.status).toBe("review_required");
    expect(run.workers[0]).toMatchObject({
      promptKind: "implementation",
      promptVersion: 1,
      attemptNumber: 1,
    });
    expect(run.workers[1]).toMatchObject({
      promptKind: "task_verification",
      attemptNumber: 1,
    });
    expect(run.workers[2].promptKind).toBe("integration_verification");
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


test("a native frontier Ticket is implemented, verified on two axes, and committed exactly once", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "native-ticket-"));
  const git = (args) => execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], { cwd, encoding: "utf8" }).trim();
  git(["init", "--initial-branch=main"]); git(["config", "user.name", "Ticket Test"]); git(["config", "user.email", "ticket@example.com"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n"); git(["add", "base.txt"]); git(["commit", "-m", "Initial commit"]);
  const baseRevision = git(["rev-parse", "HEAD"]);
  const run = makeRun();
  Object.assign(run, {
    workflowKind: "native", worktreePath: cwd, repoPath: cwd, baseRevision,
    runWorkspacePath: fs.mkdtempSync(path.join(os.tmpdir(), "native-ticket-evidence-")),
    phase: "implement", status: "implement_ready", specification: "Deliver a slice",
    approvals: { spec: { revision: 1 } }, approvedTicketsSnapshot: { revision: 1 },
    artifacts: { spec: { markdown: "# Spec\n\n## Testing Decisions\nExisting service seam" }, shape: { domain: { canonicalTerms: ["Ticket Commit"] } } },
  });
  Object.assign(run.tasks[0], { tddPolicy: "test-first", tddException: "None", testSeams: ["service"], title: "Deliver visible slice" });
  const implementation = JSON.stringify({ summary: "implemented", changedFiles: ["slice.txt"], redEvidence: ["missing file test failed"], greenEvidence: ["focused test passed"], alternativeVerificationEvidence: [], checks: ["focused: pass"], risks: [] });
  const twoAxisPass = JSON.stringify({ verdict: "pass", spec: { verdict: "pass", findings: [] }, standards: { verdict: "pass", findings: [] }, summary: "passed", checks: ["focused: pass"], failedCriteria: [], feedback: "", risks: [] });
  const { scheduler, workerProcessService } = fakeScheduler([
    { effect: () => fs.writeFileSync(path.join(cwd, "slice.txt"), "visible\n"), stdout: implementation },
    { stdout: twoAxisPass },
  ]);

  await scheduler.autoRun(run);

  expect(run.tasks[0].status).toBe("succeeded");
  expect(run.tasks[0].commit.changedFiles).toEqual(["slice.txt"]);
  expect(run.tasks[0].attempts[0].verification).toMatchObject({ spec: { verdict: "pass" }, standards: { verdict: "pass" }, diffFingerprint: expect.any(String) });
  expect(git(["show", "--pretty=format:", "--name-only", "HEAD"])).toBe("slice.txt");
  expect(git(["rev-list", "--count", `${baseRevision}..HEAD`])).toBe("1");
  expect(workerProcessService.run.mock.calls.map((call) => call[0].launch.permissionMode)).toEqual(["workspace-write", "read-only"]);
});


function nativeRepositoryRun(taskOverrides = []) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "native-chain-"));
  const git = (args) => execFileSync("git", ["-c", `safe.directory=${cwd}`, ...args], { cwd, encoding: "utf8" }).trim();
  git(["init", "--initial-branch=main"]); git(["config", "user.name", "Ticket Test"]); git(["config", "user.email", "ticket@example.com"]);
  fs.writeFileSync(path.join(cwd, "base.txt"), "base\n"); git(["add", "base.txt"]); git(["commit", "-m", "Initial commit"]);
  const run = makeRun();
  Object.assign(run, { workflowKind: "native", worktreePath: cwd, repoPath: cwd, runWorkspacePath: fs.mkdtempSync(path.join(os.tmpdir(), "native-chain-evidence-")), baseRevision: git(["rev-parse", "HEAD"]), phase: "implement", status: "running", specification: "Deliver dependent slices", approvals: { spec: { revision: 1 } }, approvedTicketsSnapshot: { revision: 1 }, artifacts: { spec: { markdown: "# Spec\n\n## Testing Decisions\nExisting service seam" }, shape: { domain: { canonicalTerms: ["Ticket Commit"] } } } });
  run.tasks = taskOverrides.map((override, index) => ({ id: `ticket-${index + 1}`, title: `Deliver slice ${index + 1}`, objective: `Deliver slice ${index + 1}`, successCriteria: ["Visible"], dependencies: index ? [`ticket-${index}`] : [], relevantScope: [], contextNotes: [], verificationGuidance: [], testSeams: ["service"], tddPolicy: "test-first", tddException: "None", implementationTier: "standard", verificationTier: "standard", maxAttempts: 3, status: "planned", attempts: [], ...override }));
  return { cwd, git, run };
}

const implementationResult = (file, label) => JSON.stringify({ summary: label, changedFiles: [file], redEvidence: [`${label} red`], greenEvidence: [`${label} green`], alternativeVerificationEvidence: [], checks: ["focused: pass"], risks: [] });
const axisPass = JSON.stringify({ verdict: "pass", spec: { verdict: "pass", findings: [] }, standards: { verdict: "pass", findings: [] }, summary: "passed", checks: ["focused: pass"], failedCriteria: [], feedback: "", risks: [] });
const fixVerdict = (feedback) => JSON.stringify({ verdict: "fix_required", spec: { verdict: "fail", findings: [feedback] }, standards: { verdict: "pass", findings: [] }, summary: "fix", checks: [], failedCriteria: ["Visible"], feedback, risks: [] });

test("executes a dependent Ticket chain serially from each previous Ticket Commit", async () => {
  const { cwd, git, run } = nativeRepositoryRun([{}, {}]);
  const { scheduler } = fakeScheduler([
    { effect: () => fs.writeFileSync(path.join(cwd, "first.txt"), "first\n"), stdout: implementationResult("first.txt", "first") }, { stdout: axisPass },
    { effect: () => { if (!fs.existsSync(path.join(cwd, "first.txt"))) throw new Error("missing prior commit"); fs.writeFileSync(path.join(cwd, "second.txt"), "second\n"); }, stdout: implementationResult("second.txt", "second") }, { stdout: axisPass },
  ]);
  await scheduler.autoRun(run);
  expect(run.tasks.map((task) => task.status)).toEqual(["succeeded", "succeeded"]);
  expect(git(["rev-list", "--count", `${run.baseRevision}..HEAD`])).toBe("2");
  expect(run.status).toBe("integration_required");
});

test("a fix-required verdict carries the diff into a fresh bounded attempt", async () => {
  const { cwd, git, run } = nativeRepositoryRun([{}]);
  const { scheduler } = fakeScheduler([
    { effect: () => fs.writeFileSync(path.join(cwd, "slice.txt"), "bad\n"), stdout: implementationResult("slice.txt", "first") }, { stdout: fixVerdict("replace bad output") },
    { effect: () => fs.writeFileSync(path.join(cwd, "slice.txt"), "good\n"), stdout: implementationResult("slice.txt", "retry") }, { stdout: axisPass },
  ]);
  await scheduler.autoRun(run);
  expect(run.tasks[0].attempts).toHaveLength(2);
  expect(run.tasks[0].status).toBe("succeeded");
  expect(git(["show", "HEAD:slice.txt"])).toBe("good");
});

test("exhausted retries preserve the failed diff and evidence without a Ticket Commit", async () => {
  const { cwd, git, run } = nativeRepositoryRun([{ maxAttempts: 3 }]);
  const outputs = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) outputs.push(
    { effect: () => fs.writeFileSync(path.join(cwd, "slice.txt"), `failed-${attempt}\n`), stdout: implementationResult("slice.txt", `attempt ${attempt}`) },
    { stdout: fixVerdict(`failure ${attempt}`) },
  );
  const { scheduler } = fakeScheduler(outputs);
  await scheduler.autoRun(run);
  expect(run.tasks[0].status).toBe("human_review_required");
  expect(run.tasks[0].attempts).toHaveLength(3);
  expect(run.tasks[0].commit).toBeUndefined();
  expect(fs.readFileSync(path.join(cwd, "slice.txt"), "utf8")).toBe("failed-3\n");
  expect(git(["rev-parse", "HEAD"])).toBe(run.baseRevision);
});


test("unexpected edits between bounded attempts pause without staging or guessing", async () => {
  const { cwd, git, run } = nativeRepositoryRun([{}]);
  const { scheduler } = fakeScheduler([
    { effect: () => fs.writeFileSync(path.join(cwd, "slice.txt"), "worker diff\n"), stdout: implementationResult("slice.txt", "first") },
    { stdout: fixVerdict("retry it"), afterResolve: () => fs.writeFileSync(path.join(cwd, "external.txt"), "unexpected\n") },
  ]);
  await scheduler.autoRun(run);
  expect(run.status).toBe("paused");
  expect(run.tasks[0].status).toBe("external_edit_detected");
  expect(git(["status", "--porcelain"])).toContain("external.txt");
  expect(git(["rev-parse", "HEAD"])).toBe(run.baseRevision);
});
