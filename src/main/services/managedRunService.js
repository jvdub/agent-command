const fs = require("fs");
const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { execFileSync } = require("child_process");
const {
  addRunEvent,
  clonePlanDefinition,
  createApprovedPlanSnapshot,
  createRuntimeTasks,
  extractStructuredJson,
  nowIso,
  summarizeRun,
  validateAndNormalizePlan,
  unwrapProviderOutput,
} = require("./managedRunUtils");
const { createManagedRunSpecArtifactService, specPrompt } = require("./managedRunSpecArtifactService");
const { createManagedRunTicketsArtifactService, ticketsPrompt, validateTicketsMarkdown } = require("./managedRunTicketsArtifactService");
const { createManagedRunRevisionService } = require("./managedRunRevisionService");

const PLANNING_SAFETY = `Safety rules:
- Inspect the repository but do not modify files.
- Never commit, push, publish, open a pull request, or delete files.
- Preserve unrelated working-tree changes.`;

function planningPrompt(run) {
  return `You are the planning worker for an Agentic Command Managed Run. Create a small, independently verifiable implementation plan. Do not implement it.

Repository: ${run.repoPath}
User specification:
${run.specification}

${PLANNING_SAFETY}

Return exactly one JSON object:
{
  "objective":"mission objective",
  "inspection":{
    "status":"succeeded|blocked",
    "repositoryState":"empty|nonempty|unknown",
    "commandsRun":["read-only command actually run"],
    "filesInspected":["path actually inspected; may be empty for an empty repository"],
    "blocker":null
  },
  "constraints":["constraint"],
  "nonGoals":["non-goal"],
  "successCriteria":["observable mission criterion"],
  "risks":["risk"],
  "unresolvedQuestions":["question requiring human judgment"],
  "finalVerificationGuidance":["mission-wide check"],
  "tasks":[{
    "id":"task-1",
    "title":"bounded title",
    "objective":"specific implementation objective",
    "successCriteria":["observable task criterion"],
    "dependencies":[],
    "relevantScope":["likely path or subsystem"],
    "implementationTier":"economy|standard|premium",
    "verificationTier":"economy|standard|premium",
    "verificationGuidance":["focused check"],
    "contextNotes":["essential context"],
    "maxAttempts":3
  }]
}`;
}

function createManagedRunService({
  runs,
  managedRunPersistenceService,
  workerProviderRegistry,
  workerProcessService,
  getTaskSchedulerService,
  tokenLedgerService,
  workspaceFileService,
  managedRunWorkspaceService,
  managedRunTicketExecutionService,
  sessionService,
  shapeDomainDocumentService = {
    inspect: () => ({ hasConvention: false, recognizedPaths: [], canonicalTerms: [] }),
    preview: () => ({ changedPaths: [], diff: "", fingerprint: createHash("sha256").update("").digest("hex") }),
    materializeProposal: () => ({ materialized: false }),
    saveProposal: () => ({ proposalPath: "shape/domain-proposal.md" }),
    commitApproved: () => null,
    startGuard: () => ({ guarded: false }),
    stopGuard: () => false,
  },
  publishRun,
}) {
  const specArtifactService = createManagedRunSpecArtifactService();
  const ticketsArtifactService = createManagedRunTicketsArtifactService();
  const revisionService = createManagedRunRevisionService();

  function requireRun(runId) {
    const run = runs.get(runId);
    if (!run) throw new Error("Managed Run not found.");
    return run;
  }

  function saveAndPublish(run) {
    run.updatedAt = nowIso();
    managedRunPersistenceService.save();
    const summary = summarizeRun(run);
    publishRun(summary);
    return summary;
  }

  function inspectRepository(inputPath) {
    const repoPath = path.resolve(String(inputPath || "").trim());
    const isDirectory = Boolean(
      repoPath && fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory(),
    );
    if (!isDirectory) {
      return {
        repoPath,
        isDirectory: false,
        isGitRepository: false,
        isEmpty: false,
      };
    }
    const isGitRepository = fs.existsSync(path.join(repoPath, ".git"));
    let git = null;
    if (isGitRepository) {
      try {
        git = managedRunWorkspaceService.inspect(repoPath);
      } catch {
        git = null;
      }
    }
    return {
      repoPath,
      isDirectory: true,
      isGitRepository,
      isEmpty: fs.readdirSync(repoPath).length === 0,
      hasCommittedBase: Boolean(git?.baseRevision),
      baseRevision: git?.baseRevision || null,
      baseBranch: git?.baseBranch || null,
      targetBranch: git?.targetBranch || null,
      sourceWasDirty: Boolean(git?.sourceWasDirty),
    };
  }

  function create(input) {
    const repository = inspectRepository(input?.repoPath);
    const sourceRepoPath = repository.repoPath;
    const specification = String(input?.idea || input?.specification || "").trim();
    if (!specification) throw new Error("An idea is required.");
    if (!repository.isDirectory) {
      throw new Error("Repository path must be a readable directory.");
    }
    if (!repository.isGitRepository) {
      if (input?.initializeGit !== true) {
        throw new Error(
          "Repository path is not a Git working tree. Confirm Git initialization to continue.",
        );
      }
      try {
        execFileSync("git", ["init"], {
          cwd: sourceRepoPath,
          windowsHide: true,
          stdio: "pipe",
        });
      } catch (error) {
        throw new Error(
          `Git repository initialization failed: ${error.stderr?.toString().trim() || error.message}`,
        );
      }
      if (!fs.existsSync(path.join(repoPath, ".git"))) {
        throw new Error("Git initialization completed without creating repository metadata.");
      }
    }
    const now = nowIso();
    const provider = String(input?.provider || "codex");
    const id = randomUUID();
    const title = String(input?.title || specification.split(/\r?\n/u)[0]).slice(0, 120);
    let workspace;
    try {
      workspace = managedRunWorkspaceService.create({
        runId: id,
        title,
        sourceRepoPath,
        runWorkspacePath: input?.runWorkspacePath,
        trackRunWorkspace: input?.trackRunWorkspace === true,
        baseRef: input?.baseRef,
        targetBranch: input?.targetBranch,
        branchName: input?.branchName,
      });
    } catch (error) {
      throw new Error(`Managed Run requires a committed Git base: ${error.message}`);
    }
    const run = {
      id,
      title,
      workflowKind: "native",
      workflowVersion: 1,
      phase: "shape",
      repoPath: workspace.worktreePath,
      sourceRepoPath,
      runWorkspacePath: workspace.runWorkspacePath,
      worktreePath: workspace.worktreePath,
      baseRevision: workspace.baseRevision,
      baseBranch: workspace.baseBranch,
      targetBranch: workspace.targetBranch,
      branchName: workspace.branchName,
      sourceWasDirty: workspace.sourceWasDirty,
      trackRunWorkspace: workspace.trackRunWorkspace,
      specification,
      status: "shape_required",
      artifacts: {},
      approvals: {},
      plan: null,
      planSource: null,
      planRevision: 0,
      approvedRevision: null,
      approvedAt: null,
      approvedPlanSnapshot: null,
      tasks: [],
      routing: {
        planner: { provider, tier: "premium", model: String(input?.planningModel || "") },
        implementer: { provider, tier: "standard", model: String(input?.implementationModel || "") },
        verifier: { provider, tier: "standard", model: String(input?.verificationModel || "") },
        integration_verifier: { provider, tier: "premium", model: String(input?.integrationModel || "") },
      },
      workers: [],
      events: [],
      usage: tokenLedgerService.createLedger(),
      finalVerification: null,
      activeWorkerId: null,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    addRunEvent(run, `Managed Run created from ${workspace.baseRevision.slice(0, 12)}; Shape requires human approval.`);
    runs.set(run.id, run);
    ensureShapeArtifact(run);
    run.artifacts.shape.summaryMarkdown = fs.readFileSync(shapePaths(run).summary, "utf8");
    return saveAndPublish(run);
  }

  function shapePaths(run) {
    const directory = path.join(run.runWorkspacePath, "shape");
    return { directory, summary: path.join(directory, "summary.md") };
  }

  function ensureShapeArtifact(run) {
    const paths = shapePaths(run);
    fs.mkdirSync(paths.directory, { recursive: true });
    if (!fs.existsSync(paths.summary)) {
      fs.writeFileSync(
        paths.summary,
        `# Shape\n\n## Idea\n\n${run.specification}\n\n## Decisions\n\n`,
        "utf8",
      );
    }
    run.artifacts ||= {};
    run.artifacts.shape ||= {
      summaryPath: "shape/summary.md",
      summaryRevision: 0,
      conversationRevision: 0,
      revisions: [],
    };
    run.artifacts.shape.domain ||= {
      ...shapeDomainDocumentService?.inspect(run.worktreePath),
      proposalPath: "shape/domain-proposal.md",
      proposalMarkdown: "",
      diff: "",
      fingerprint: null,
      changedPaths: [],
    };
    return paths;
  }

  function findShapeSession(run) {
    return sessionService?.listSessions().find((candidate) => candidate.id === run.shapeSessionId) || null;
  }

  function linkedShapeSession(run) {
    if (!run.shapeSessionId) throw new Error("Open and link a Shape conversation first.");
    const session = findShapeSession(run);
    if (!session) throw new Error("The linked Shape conversation is no longer available.");
    return session;
  }

  function guardShapeWorktree(run, allowNewConvention = false) {
    try {
      shapeDomainDocumentService.startGuard(
        run.worktreePath,
        (rejectedPaths, error) => {
          if (error) {
            sessionService?.stopSessionById?.(run.shapeSessionId);
            run.status = "shape_required";
            run.shapeSessionId = null;
            addRunEvent(run, `Shape conversation stopped because its write guard failed: ${error.message}`, "warning");
          } else {
            addRunEvent(run, `Shape rejected and restored out-of-policy writes: ${rejectedPaths.join(", ")}.`, "warning");
          }
          saveAndPublish(run);
        },
        { allowNewConvention },
      );
    } catch (error) {
      if (run.status === "shaping") {
        run.status = "shape_required";
        run.shapeSessionId = null;
      }
      addRunEvent(run, `Shape write guard blocked the conversation: ${error.message}`, "warning");
      throw new Error(`Shape cannot start without its domain-document write guard: ${error.message}`);
    }
  }

  function linkShapeSession(runId, sessionId) {
    const run = requireRun(runId);
    if (run.workflowKind !== "native") throw new Error("Shape sessions require a native Managed Run.");
    const session = sessionService?.listSessions().find((candidate) => candidate.id === sessionId);
    if (!session) throw new Error("Shape session not found.");
    ensureShapeArtifact(run);
    run.shapeSessionId = session.id;
    run.phase = "shape";
    run.status = "shaping";
    guardShapeWorktree(run);
    addRunEvent(run, "Persistent Shape conversation linked with a domain-document write guard.");
    return saveAndPublish(run);
  }

  function latestConversation(run) {
    const shape = run.artifacts.shape;
    const session = findShapeSession(run);
    if (session) return String(session.outputBuffer || "");
    const latestPath = shape.revisions.at(-1)?.conversationPath;
    return latestPath
      ? fs.readFileSync(path.join(run.runWorkspacePath, latestPath), "utf8")
      : "";
  }

  function persistShapeRevision(run, markdown, source) {
    const paths = ensureShapeArtifact(run);
    const shape = run.artifacts.shape;
    const summary = `${String(markdown || "").trim()}\n`;
    if (!summary.trim()) throw new Error("A Shape summary is required.");
    const conversation = latestConversation(run);
    const summaryHash = createHash("sha256").update(summary).digest("hex");
    const conversationHash = createHash("sha256").update(conversation).digest("hex");
    const summaryChanged = summaryHash !== shape.summaryHash;
    const conversationChanged = conversationHash !== shape.conversationHash;
    if (summaryChanged) shape.summaryRevision += 1;
    if (conversationChanged || !shape.conversationRevision) shape.conversationRevision += 1;
    const summaryRevisionPath = path.join(paths.directory, `summary-r${shape.summaryRevision}.md`);
    const conversationPath = path.join(paths.directory, `conversation-r${shape.conversationRevision}.txt`);
    fs.writeFileSync(paths.summary, summary, "utf8");
    if (summaryChanged || !fs.existsSync(summaryRevisionPath)) fs.writeFileSync(summaryRevisionPath, summary, "utf8");
    if (conversationChanged || !fs.existsSync(conversationPath)) fs.writeFileSync(conversationPath, conversation, "utf8");
    shape.summaryMarkdown = summary;
    shape.summaryHash = summaryHash;
    shape.conversationHash = conversationHash;
    if (summaryChanged || conversationChanged || shape.revisions.length === 0) {
      shape.revisions.push({
        summaryRevision: shape.summaryRevision,
        conversationRevision: shape.conversationRevision,
        summaryPath: `shape/summary-r${shape.summaryRevision}.md`,
        conversationPath: `shape/conversation-r${shape.conversationRevision}.txt`,
        source,
        createdAt: nowIso(),
      });
    }
    return shape;
  }

  function invalidateShape(run, message) {
    run.approvals.shape = null;
    if (run.artifacts?.spec) run.artifacts.spec.stale = true;
    run.approvals.spec = null;
    invalidateDownstreamFromSpec(run, "shape");
    run.phase = "shape";
    run.status = "shape_approval_required";
    addRunEvent(run, message, "warning");
  }

  function reconcileApprovedShape(run) {
    if (!run.approvals?.shape || !run.artifacts?.shape) return false;
    const paths = ensureShapeArtifact(run);
    const summary = fs.readFileSync(paths.summary, "utf8");
    const summaryHash = createHash("sha256").update(summary).digest("hex");
    const conversationHash = createHash("sha256").update(latestConversation(run)).digest("hex");
    if (summaryHash === run.artifacts.shape.summaryHash && conversationHash === run.artifacts.shape.conversationHash) return false;
    persistShapeRevision(run, summary, "workspace");
    invalidateShape(run, "Approved Shape changed; Spec is blocked until the new revision is approved.");
    run.updatedAt = nowIso();
    return true;
  }

  function refreshShapeDocumentation(runId, options = {}) {
    const run = requireRun(runId);
    const shape = ensureShapeArtifact(run) && run.artifacts.shape;
    const materialized = shapeDomainDocumentService.materializeProposal(
      run.worktreePath, run.runWorkspacePath, options.createProjectDocumentation === true,
    );
    const inspection = shapeDomainDocumentService.inspect(run.worktreePath);
    const allowNewConvention = materialized.materialized || shape.domain?.newConventionApproved === true;
    const preview = shapeDomainDocumentService.preview(run.worktreePath, { allowNewConvention });
    shape.domain = { ...shape.domain, ...inspection, ...preview, newConventionApproved: allowNewConvention };
    guardShapeWorktree(run, allowNewConvention);
    addRunEvent(run, preview.changedPaths.length
      ? `Shape documentation diff refreshed (${preview.changedPaths.join(", ")}).`
      : "Shape documentation diff refreshed; no tracked changes.");
    return saveAndPublish(run);
  }

  function saveShapeDomainProposal(runId, markdown) {
    const run = requireRun(runId);
    const shape = ensureShapeArtifact(run) && run.artifacts.shape;
    shapeDomainDocumentService.saveProposal(run.runWorkspacePath, markdown);
    shape.domain.proposalMarkdown = `${String(markdown || "").trim()}\n`;
    addRunEvent(run, "Proposed domain documentation saved in the Run Workspace.");
    return saveAndPublish(run);
  }

  function saveShape(runId, markdown) {
    const run = requireRun(runId);
    linkedShapeSession(run);
    persistShapeRevision(run, markdown, "app");
    invalidateShape(run, `Shape revision ${run.artifacts.shape.summaryRevision} saved; approval required.`);
    const preview = shapeDomainDocumentService.preview(run.worktreePath);
    run.artifacts.shape.domain = {
      ...run.artifacts.shape.domain,
      ...shapeDomainDocumentService.inspect(run.worktreePath),
      ...preview,
    };
    return saveAndPublish(run);
  }

  function approveShape(runId, options = {}) {
    const run = requireRun(runId);
    const paths = ensureShapeArtifact(run);
    const shape = run.artifacts.shape;
    if (!shape.summaryRevision) throw new Error("Save a Shape summary before approval.");
    const workspaceSummary = fs.readFileSync(paths.summary, "utf8");
    const workspaceHash = createHash("sha256").update(workspaceSummary).digest("hex");
    const conversationHash = createHash("sha256").update(latestConversation(run)).digest("hex");
    if (workspaceHash !== shape.summaryHash || conversationHash !== shape.conversationHash) {
      persistShapeRevision(run, workspaceSummary, workspaceHash !== shape.summaryHash ? "workspace" : "conversation");
      invalidateShape(run, "Shape changed after its last saved revision; review the new revision.");
      saveAndPublish(run);
      throw new Error("Shape changed after its last saved revision. Review and approve the new revision.");
    }
    const materialized = shapeDomainDocumentService.materializeProposal(
      run.worktreePath, run.runWorkspacePath, options.createProjectDocumentation === true,
    );
    const allowNewConvention = materialized.materialized || shape.domain?.newConventionApproved === true;
    const documentation = shapeDomainDocumentService.preview(run.worktreePath, { allowNewConvention });
    if (documentation.fingerprint !== shape.domain?.fingerprint) {
      shape.domain = { ...shape.domain, ...shapeDomainDocumentService.inspect(run.worktreePath), ...documentation };
      invalidateShape(run, "Shape documentation changed after review; review the exact diff before approval.");
      saveAndPublish(run);
      throw new Error("Shape documentation changed after review. Review the refreshed diff and approve again.");
    }
    const shapeCommit = shapeDomainDocumentService.commitApproved(
      run.worktreePath, documentation.fingerprint, { allowNewConvention },
    );
    shapeDomainDocumentService.stopGuard?.(run.worktreePath);
    shape.domain = { ...shape.domain, ...shapeDomainDocumentService.inspect(run.worktreePath), ...documentation };
    run.approvals.shape = {
      summaryRevision: shape.summaryRevision,
      conversationRevision: shape.conversationRevision,
      summaryPath: shape.revisions.at(-1).summaryPath,
      conversationPath: shape.revisions.at(-1).conversationPath,
      documentationFingerprint: documentation.fingerprint,
      documentationCommit: shapeCommit,
      approvedAt: nowIso(),
    };
    run.phase = "spec";
    run.status = "spec_required";
    if (shapeCommit) {
      run.lastVerifiedCommit = shapeCommit.revision;
      addRunEvent(run, `Shape documentation committed as ${shapeCommit.revision.slice(0, 12)}.`, "info", { shapeCommit });
    }
    addRunEvent(run, `Shape revision ${shape.summaryRevision} approved; Spec is now available.`);
    return saveAndPublish(run);
  }

  function invalidateDownstreamFromSpec(run, targetPhase = "spec") {
    for (const phase of ["tickets", "implement", "accept"]) {
      if (run.artifacts?.[phase]) run.artifacts[phase].stale = true;
      run.approvals[phase] = null;
    }
    revisionService.beginRevision(run, targetPhase, `${targetPhase === "shape" ? "Shape" : "Spec"} revision invalidated the approved Ticket graph.`);
    run.approvedTicketsSnapshot = null;
    run.finalVerification = null;
  }

  function persistSpecRevision(run, markdown, source) {
    const artifact = specArtifactService.persist(run, markdown, source);
    run.approvals.spec = null;
    invalidateDownstreamFromSpec(run);
    run.phase = "spec";
    run.status = "spec_approval_required";
    return artifact;
  }

  async function runReadOnlyPlannerWorker(run, {
    prompt, cwd, promptKind, startingStatus, startMessage,
    failureStatus, failureMessage, definitionRevision = null,
  }) {
    if (workerProcessService.hasActiveWorker(run.id)) throw new Error("A worker is already active for this Managed Run.");
    const launch = workerProviderRegistry.buildLaunch({ role: "planner", selection: run.routing.planner });
    if (launch.permissionMode !== "read-only") throw new Error(`${promptKind} requires a read-only worker.`);
    const execution = workerProcessService.run({ runId: run.id, launch, prompt, cwd });
    const placeholder = {
      id: execution.workerId, runId: run.id, taskId: null, role: "planner",
      provider: launch.provider, tier: launch.tier, model: launch.model,
      modelFlagUsed: launch.modelFlagUsed, permissionMode: launch.permissionMode,
      commandPreview: launch.preview, prompt, promptAvailability: "available",
      promptKind, promptVersion: 1, promptCreatedAt: nowIso(), definitionRevision,
      attemptNumber: null, stdout: "", stderr: "", exitCode: null,
      status: "running", startedAt: nowIso(), finishedAt: null, usage: null, git: null,
    };
    run.workers.push(placeholder);
    run.activeWorkerId = placeholder.id;
    run.status = startingStatus;
    addRunEvent(run, `${startMessage}: ${launch.preview}`);
    saveAndPublish(run);
    const worker = await execution.completion;
    const index = run.workers.findIndex((candidate) => candidate.id === worker.id);
    if (index >= 0) run.workers[index] = { ...placeholder, ...worker };
    run.activeWorkerId = null;
    tokenLedgerService.record(run.usage, worker);
    if (worker.status !== "succeeded") {
      run.status = failureStatus;
      addRunEvent(run, failureMessage, "error");
      saveAndPublish(run);
      return null;
    }
    return worker;
  }

  async function generateSpec(runId) {
    const run = requireRun(runId);
    if (!run.approvals.shape) throw new Error("Approved Shape context is required before Spec generation.");
    const shapeSummary = fs.readFileSync(path.join(run.runWorkspacePath, run.approvals.shape.summaryPath), "utf8");
    const conversation = fs.readFileSync(path.join(run.runWorkspacePath, run.approvals.shape.conversationPath), "utf8");
    const domainDocuments = (run.artifacts.shape.domain?.recognizedPaths || []).map((relativePath) => {
      const target = path.join(run.worktreePath, relativePath);
      return fs.existsSync(target) ? `# ${relativePath}\n${fs.readFileSync(target, "utf8")}` : "";
    }).filter(Boolean).join("\n\n");
    const prompt = specPrompt(run, shapeSummary, conversation, domainDocuments);
    const worker = await runReadOnlyPlannerWorker(run, {
      prompt, cwd: run.worktreePath, promptKind: "spec_generation",
      startingStatus: "spec_generating", startMessage: "Starting fresh read-only Spec worker",
      failureStatus: "spec_required", failureMessage: "Spec worker failed; inspect its output and retry.",
      definitionRevision: run.artifacts.spec?.revision || null,
    });
    if (!worker) return summarizeRun(run);
    try {
      persistSpecRevision(run, unwrapProviderOutput(worker.stdout), "worker");
      addRunEvent(run, `Spec revision ${run.artifacts.spec.revision} generated for test-seam confirmation.`);
    } catch (error) {
      run.status = "spec_required";
      addRunEvent(run, `Spec output was invalid: ${error.message}`, "error");
    }
    return saveAndPublish(run);
  }

  function saveSpec(runId, markdown) {
    const run = requireRun(runId);
    if (!run.approvals.shape) throw new Error("Approved Shape context is required.");
    persistSpecRevision(run, markdown, "human");
    addRunEvent(run, `Spec revision ${run.artifacts.spec.revision} saved; approval required.`);
    return saveAndPublish(run);
  }

  function approveSpec(runId, options = {}) {
    const run = requireRun(runId);
    const artifact = run.artifacts.spec;
    if (!artifact?.revision) throw new Error("Generate or save a Spec before approval.");
    if (options.testSeamsConfirmed !== true) throw new Error("Explicitly confirm the Spec's observable test seams before approval.");
    const current = specArtifactService.readCurrent(run);
    const currentHash = specArtifactService.fingerprint(current);
    if (currentHash !== artifact.hash) {
      persistSpecRevision(run, current, "workspace");
      addRunEvent(run, "Spec changed in the Run Workspace; the new revision requires approval.", "warning");
      saveAndPublish(run);
      throw new Error("Spec changed in the Run Workspace. Review and approve the new revision.");
    }
    artifact.approvedRevision = artifact.revision;
    artifact.previousApprovedMarkdown = artifact.markdown;
    run.approvals.spec = {
      revision: artifact.revision,
      approvedAt: nowIso(),
      action: "approved",
      upstreamShapeRevision: run.approvals.shape.summaryRevision,
      upstreamShapeSummaryRevision: run.approvals.shape.summaryRevision,
      upstreamShapeConversationRevision: run.approvals.shape.conversationRevision,
      testSeamsConfirmed: true,
      path: artifact.revisions.at(-1).path,
    };
    run.phase = "tickets";
    run.status = "tickets_required";
    addRunEvent(run, `Spec revision ${artifact.revision} approved; Tickets is now available.`);
    return saveAndPublish(run);
  }

  function persistTicketsRevision(run, markdown, source) {
    revisionService.beginRevision(run, "tickets", "Ticket graph revision replaced the approved execution snapshot.");
    const artifact = ticketsArtifactService.persist(run, markdown, source);
    run.approvals.tickets = null; run.approvedTicketsSnapshot = null;
    artifact.projection = validateTicketsMarkdown(markdown).tickets;
    revisionService.reconcile(run, artifact.projection);
    run.finalVerification = null; run.phase = "tickets"; run.status = "tickets_approval_required";
    return artifact;
  }

  async function generateTickets(runId) {
    const run = requireRun(runId);
    if (!run.approvals.spec) throw new Error("An approved Spec is required before Ticket generation.");
    const specMarkdown = await fs.promises.readFile(
      path.join(run.runWorkspacePath, run.approvals.spec.path), "utf8",
    );
    const domainDocuments = (await Promise.all(
      (run.artifacts.shape?.domain?.recognizedPaths || []).map(async (relativePath) => {
        try {
          const content = await fs.promises.readFile(path.join(run.worktreePath, relativePath), "utf8");
          return `# ${relativePath}\n${content}`;
        } catch (error) {
          if (error.code === "ENOENT") return "";
          throw error;
        }
      }),
    )).filter(Boolean).join("\n\n");
    const worker = await runReadOnlyPlannerWorker(run, {
      prompt: ticketsPrompt(run, specMarkdown, domainDocuments), cwd: run.worktreePath,
      promptKind: "tickets_generation", startingStatus: "tickets_generating",
      startMessage: "Starting fresh read-only Ticket worker", failureStatus: "tickets_required",
      failureMessage: "Ticket worker failed; inspect its output and retry.", definitionRevision: run.artifacts.tickets?.revision || null,
    });
    if (!worker) return summarizeRun(run);
    try { persistTicketsRevision(run, unwrapProviderOutput(worker.stdout), "worker"); addRunEvent(run, `Ticket graph revision ${run.artifacts.tickets.revision} generated for review.`); }
    catch (error) { run.status = "tickets_required"; addRunEvent(run, `Ticket output was invalid: ${error.message}`, "error"); }
    return saveAndPublish(run);
  }

  function saveTickets(runId, markdown) {
    const run = requireRun(runId);
    if (!run.approvals.spec) throw new Error("An approved Spec is required.");
    persistTicketsRevision(run, markdown, "human"); addRunEvent(run, `Ticket graph revision ${run.artifacts.tickets.revision} saved; approval required.`);
    return saveAndPublish(run);
  }

  function approveTickets(runId) {
    const run = requireRun(runId); const artifact = run.artifacts.tickets;
    if (!artifact?.revision) throw new Error("Generate or save Tickets before approval.");
    const current = ticketsArtifactService.readCurrent(run);
    if (ticketsArtifactService.fingerprint(current) !== artifact.hash) {
      persistTicketsRevision(run, current, "workspace"); addRunEvent(run, "Tickets changed in the Run Workspace; the new revision requires approval.", "warning");
      saveAndPublish(run); throw new Error("Tickets changed in the Run Workspace. Review and approve the new revision.");
    }
    artifact.projection = validateTicketsMarkdown(current).tickets;
    revisionService.reconcile(run, artifact.projection);
    revisionService.assertResolved(run);
    artifact.approvedRevision = artifact.revision; artifact.previousApprovedMarkdown = artifact.markdown;
    run.approvedTicketsSnapshot = ticketsArtifactService.freeze(run);
    run.approvedTicketsSnapshot.lineage = run.revisionReconciliation ? JSON.parse(JSON.stringify(run.revisionReconciliation)) : null;
    run.approvals.tickets = { revision: artifact.revision, specRevision: run.approvals.spec.revision, approvedAt: run.approvedTicketsSnapshot.approvedAt, action: "approved", path: artifact.revisions.at(-1).path };
    const retained = new Map((run.revisionReconciliation?.entries || []).filter((entry) => entry.disposition === "retain").map((entry) => [entry.ticketId, entry]));
    const historyTasks = run.executionHistory?.at(-1)?.tasks || [];
    run.tasks = artifact.projection.map((ticket) => {
      const preserved = retained.has(ticket.id) ? historyTasks.find((task) => task.id === ticket.id && task.status === "succeeded") : null;
      return preserved ? { ...preserved, ...ticket, objective: ticket.behavior, successCriteria: ticket.acceptanceCriteria, relevantScope: ticket.contextNotes, status: "succeeded", preservedFromRevision: run.revisionReconciliation.previousSnapshotRevision } : { ...ticket, objective: ticket.behavior, successCriteria: ticket.acceptanceCriteria, relevantScope: ticket.contextNotes, status: "planned", attempts: [] };
    });
    run.phase = "implement"; run.status = "implement_ready";
    addRunEvent(run, `Ticket graph revision ${artifact.revision} approved; its exact execution projection is frozen.`);
    const summary = saveAndPublish(run);
    void getTaskSchedulerService().autoRun(run).catch((error) => {
      run.status = "failed";
      addRunEvent(run, `Ticket execution failed to start: ${error.message}`, "error");
      saveAndPublish(run);
    });
    return summary;
  }

  function decideRevisionCommit(runId, ticketId, disposition, reversalTicketId = null) {
    const run = requireRun(runId);
    revisionService.decide(run, ticketId, disposition, reversalTicketId);
    addRunEvent(run, `${ticketId} preserved commit will be ${disposition === "retain" ? "retained" : `reversed by ${reversalTicketId}`}.`, "warning");
    return saveAndPublish(run);
  }

  function list() {
    let reconciled = false;
    for (const run of runs.values()) reconciled = reconcileApprovedShape(run) || reconciled;
    if (reconciled) managedRunPersistenceService.save();
    return Array.from(runs.values())
      .filter((run) => !run.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(summarizeRun);
  }

  function get(runId) {
    const run = requireRun(runId);
    if (reconcileApprovedShape(run)) managedRunPersistenceService.save();
    return summarizeRun(run);
  }

  function getWorkerDetail(runId, workerId) {
    const run = requireRun(runId);
    const worker = run.workers.find((candidate) => candidate.id === workerId);
    if (!worker) throw new Error("Managed Run worker not found.");
    return {
      id: worker.id,
      runId: worker.runId,
      taskId: worker.taskId,
      role: worker.role,
      attemptNumber: worker.attemptNumber || null,
      promptKind: worker.promptKind || worker.role,
      promptVersion: worker.promptVersion || 1,
      promptCreatedAt: worker.promptCreatedAt || worker.startedAt,
      definitionRevision: worker.definitionRevision || null,
      prompt: worker.promptAvailability === "not_persisted" ? null : worker.prompt,
      promptAvailability: worker.promptAvailability || (worker.prompt ? "available" : "not_persisted"),
      stdout: worker.stdout,
      stderr: worker.stderr,
      provider: worker.provider,
      tier: worker.tier,
      model: worker.model,
      permissionMode: worker.permissionMode,
      commandPreview: worker.commandPreview,
      status: worker.status,
      startedAt: worker.startedAt,
      finishedAt: worker.finishedAt,
      usage: worker.usage,
      git: worker.git,
      artifacts: worker.artifacts || null,
    };
  }

  async function openFile(runId, filePath) {
    const run = requireRun(runId);
    return workspaceFileService.openEditorFileAtRoot(run.repoPath, filePath, run.id);
  }

  async function generatePlan(runId) {
    const run = requireRun(runId);
    const prompt = planningPrompt(run);
    const worker = await runReadOnlyPlannerWorker(run, {
      prompt, cwd: run.repoPath, promptKind: "planning",
      startingStatus: "planning", startMessage: "Starting planner",
      failureStatus: "review_required", failureMessage: "Planning worker failed; inspect its output and retry.",
      definitionRevision: run.planRevision || null,
    });
    if (!worker) return summarizeRun(run);
    try {
      const plan = validateAndNormalizePlan(extractStructuredJson(worker.stdout), {
        requireInspection: true,
      });
      run.plan = clonePlanDefinition(plan);
      run.planSource = "worker";
      run.planRevision += 1;
      run.approvedRevision = null;
      run.approvedAt = null;
      run.approvedPlanSnapshot = null;
      run.tasks = createRuntimeTasks(plan.tasks);
      run.status = "approval_required";
      addRunEvent(run, `Plan revision ${run.planRevision} is ready for human approval.`);
    } catch (error) {
      run.status = "review_required";
      addRunEvent(run, `Planning output was invalid: ${error.message}`, "error");
    }
    return saveAndPublish(run);
  }

  function savePlan(runId, rawPlan) {
    const run = requireRun(runId);
    const plan = validateAndNormalizePlan(
      typeof rawPlan === "string" ? JSON.parse(rawPlan) : rawPlan,
    );
    run.plan = clonePlanDefinition(plan);
    run.planSource = "human";
    run.planRevision += 1;
    run.approvedRevision = null;
    run.approvedAt = null;
    run.approvedPlanSnapshot = null;
    run.tasks = createRuntimeTasks(plan.tasks);
    run.finalVerification = null;
    run.status = "approval_required";
    addRunEvent(run, `Plan revision ${run.planRevision} saved; approval is required.`);
    return saveAndPublish(run);
  }

  function approvePlan(runId) {
    const run = requireRun(runId);
    if (!run.plan || run.planRevision < 1) throw new Error("No plan is available to approve.");
    const generatedPlan =
      run.planSource === "worker" ||
      (!run.planSource && run.workers.some((worker) => worker.role === "planner"));
    if (
      generatedPlan &&
      (run.plan.inspection?.status !== "succeeded" ||
        !Array.isArray(run.plan.inspection?.commandsRun) ||
        run.plan.inspection.commandsRun.length === 0 ||
        run.plan.inspection.blocker)
    ) {
      run.status = "review_required";
      addRunEvent(
        run,
        "Plan approval blocked because repository inspection was not verified. Regenerate or save a human-reviewed replacement plan.",
        "error",
      );
      saveAndPublish(run);
      throw new Error(
        "Generated plans require verified repository inspection before approval.",
      );
    }
    run.approvedRevision = run.planRevision;
    run.approvedAt = nowIso();
    run.approvedPlanSnapshot = createApprovedPlanSnapshot(run.plan, {
      revision: run.approvedRevision,
      approvedAt: run.approvedAt,
    });
    run.status = "ready";
    addRunEvent(run, `Plan revision ${run.planRevision} approved by the user.`);
    return saveAndPublish(run);
  }

  function start(runId) {
    const run = requireRun(runId);
    if (run.workflowKind === "native") {
      if (run.phase !== "implement" || !["implement_ready", "paused"].includes(run.status) || !run.approvedTicketsSnapshot) throw new Error("An approved executable Ticket frontier is required.");
      run.status = "running";
      addRunEvent(run, "The user started one executable frontier Ticket.");
      const summary = saveAndPublish(run);
      void getTaskSchedulerService().autoRun(run).catch((error) => {
        run.status = "failed"; addRunEvent(run, `Ticket execution failed to start: ${error.message}`, "error"); saveAndPublish(run);
      });
      return summary;
    }
    if (run.approvedRevision !== run.planRevision) {
      throw new Error("The current plan revision must be approved before execution.");
    }
    if (run.approvedPlanSnapshot?.revision !== run.approvedRevision) {
      throw new Error("The approved plan snapshot is missing or stale; approve the plan again.");
    }
    if (!["ready", "paused", "review_required"].includes(run.status)) {
      throw new Error(`Managed Run cannot start from ${run.status}.`);
    }
    if (run.finalVerification?.verdict === "pass") {
      throw new Error("Final verification already passed; accept or revise the run.");
    }
    const conflict = Array.from(runs.values()).find(
      (candidate) =>
        candidate.id !== run.id &&
        path.resolve(candidate.repoPath) === path.resolve(run.repoPath) &&
        ["running", "final_verification"].includes(candidate.status),
    );
    if (conflict) {
      throw new Error(`Another Managed Run is editing this working tree: ${conflict.title}`);
    }
    run.status = "ready";
    addRunEvent(run, "Automatic serial execution started.");
    saveAndPublish(run);
    void getTaskSchedulerService().autoRun(run);
    return summarizeRun(run);
  }

  function pause(runId) {
    const run = requireRun(runId);
    run.pauseRequested = workerProcessService.hasActiveWorker(run.id);
    run.status = "paused";
    addRunEvent(run, "Managed Run paused; the active worker may finish but no new worker will start.");
    return saveAndPublish(run);
  }

  function cancel(runId) {
    const run = requireRun(runId);
    workerProcessService.cancel(run.id);
    run.status = "cancelled";
    addRunEvent(run, "Managed Run cancelled by the user.", "warning");
    return saveAndPublish(run);
  }

  function retry(runId, taskId = null) {
    const run = requireRun(runId);
    const task = taskId
      ? run.tasks.find((item) => item.id === taskId)
      : run.tasks.find((item) =>
          ["failed", "human_review_required", "replan_required"].includes(item.status),
        );
    if (!task) throw new Error("No task is available to retry.");
    if (run.workflowKind === "native" && task.attempts.length >= task.maxAttempts) throw new Error("Increase the Ticket attempt budget while paused before retrying.");
    if (run.workflowKind !== "native") task.maxAttempts = Math.max(task.maxAttempts, task.attempts.length + 1);
    task.status = "retry_required";
    run.finalVerification = null;
    run.status = run.workflowKind === "native" ? "running" : "ready";
    addRunEvent(run, `${task.id} queued for an explicitly approved retry.`);
    saveAndPublish(run);
    void getTaskSchedulerService().autoRun(run);
    return summarizeRun(run);
  }

  function updateIntegrationRepairLimits(runId, limits = {}) {
    const run = requireRun(runId);
    if (run.workflowKind !== "native" || run.status !== "paused") throw new Error("Integration repair limits may only change while a native Managed Run is paused.");
    if (workerProcessService.hasActiveWorker(run.id)) throw new Error("Wait for the active repair worker to finish before changing integration limits.");
    const cycles = Number(limits.cycles); const attempts = Number(limits.attempts);
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10 || !Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new Error("Integration repair limits must be whole numbers from 1 to 10.");
    run.integrationRepairCycleLimit = cycles; run.integrationRepairAttemptLimit = attempts;
    const repair = run.integrationRepairs?.at(-1);
    if (repair && repair.status !== "succeeded" && attempts > repair.attempts.length) {
      repair.maxAttempts = attempts; repair.status = "retry_required";
    }
    addRunEvent(run, `Integration repair limits changed to ${cycles} cycles and ${attempts} attempts while paused.`, "warning", { humanOverride: true });
    return saveAndPublish(run);
  }

  function updateTicketAttemptBudget(runId, taskId, maxAttempts) {
    const run = requireRun(runId);
    if (run.workflowKind !== "native") throw new Error("Attempt budgets require native Tickets.");
    if (workerProcessService.hasActiveWorker(run.id)) throw new Error("Pause and wait for the active worker before changing an attempt budget.");
    const task = run.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("Managed Run Ticket not found.");
    if (run.status !== "paused" && task.attempts.length > 0) throw new Error("Attempt budgets may change only before execution or while paused.");
    const budget = Number(maxAttempts);
    if (!Number.isInteger(budget) || budget < task.attempts.length + 1 || budget > 10) throw new Error("Attempt budget must allow one future attempt and cannot exceed 10.");
    task.maxAttempts = budget;
    addRunEvent(run, `${task.id} attempt budget changed by the user to ${budget}.`, "warning", { humanOverride: true, taskId });
    return saveAndPublish(run);
  }

  async function recoverTicket(runId, taskId, action, confirmed = false) {
    const run = requireRun(runId);
    if (run.workflowKind !== "native") throw new Error("Ticket recovery requires a native Managed Run.");
    if (workerProcessService.hasActiveWorker(run.id)) throw new Error("Pause and wait for the active worker before recovery.");
    const task = run.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("Managed Run Ticket not found.");
    if (action === "takeover") {
      task.manualTakeover = true;
      task.status = "retry_required";
      run.status = "paused";
      addRunEvent(run, `${task.id} paused for manual takeover.`, "warning", { humanOverride: true, taskId });
      return saveAndPublish(run);
    }
    if (action === "return_to_tickets") {
      run.phase = "tickets"; run.status = "tickets_approval_required";
      run.approvals.tickets = null; run.approvedTicketsSnapshot = null;
      addRunEvent(run, `${task.id} returned to Tickets authoring; verified Ticket Commits remain in the Run Worktree.`, "warning", { humanOverride: true, taskId });
      return saveAndPublish(run);
    }
    if (action === "restore_verified_base") {
      if (confirmed !== true) throw new Error("Separately confirm discarding the uncommitted failed change set.");
      const recovery = await managedRunTicketExecutionService.restoreVerifiedBase(run.worktreePath, run.lastVerifiedCommit || run.baseRevision);
      task.recoveries ||= []; task.recoveries.push({ action, ...recovery });
      task.status = "retry_required"; run.status = "paused";
      addRunEvent(run, `${task.id} restored to verified commit ${recovery.revision.slice(0, 12)} after explicit confirmation.`, "warning", { humanOverride: true, taskId });
      return saveAndPublish(run);
    }
    throw new Error("Unsupported Ticket recovery action.");
  }

  function updateRouting(runId, routing) {
    const run = requireRun(runId);
    if (workerProcessService.hasActiveWorker(run.id)) {
      throw new Error("Pause and wait for the active worker before changing routing.");
    }
    for (const role of Object.keys(run.routing)) {
      if (!routing?.[role]) continue;
      run.routing[role] = {
        ...run.routing[role],
        provider: String(routing[role].provider || run.routing[role].provider),
        tier: String(routing[role].tier || run.routing[role].tier),
        model: String(routing[role].model ?? run.routing[role].model),
      };
      workerProviderRegistry.resolveSelection(run.routing[role]);
    }
    addRunEvent(run, "Future worker routing updated by the user.");
    return saveAndPublish(run);
  }

  function accept(runId) {
    const run = requireRun(runId);
    if (run.finalVerification?.verdict !== "pass") {
      throw new Error("A passing final integration verification is required.");
    }
    run.status = "completed";
    addRunEvent(run, "Final result accepted by the user.");
    return saveAndPublish(run);
  }

  function archive(runId) {
    const run = requireRun(runId);
    if (["planning", "running", "final_verification"].includes(run.status)) {
      throw new Error("An active Managed Run cannot be archived.");
    }
    run.archived = true;
    addRunEvent(run, "Managed Run archived.");
    return saveAndPublish(run);
  }

  function setTaskStatus(runId, taskId, status) {
    const run = requireRun(runId);
    if (workerProcessService.hasActiveWorker(run.id)) {
      throw new Error("Task state cannot be overridden while a worker is active.");
    }
    const allowed = new Set([
      "planned",
      "retry_required",
      "human_review_required",
      "succeeded",
      "cancelled",
      "failed",
    ]);
    if (!allowed.has(status)) throw new Error("Unsupported manual task status.");
    const task = run.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error("Managed Run task not found.");
    const previous = task.status;
    task.status = status;
    run.finalVerification = null;
    run.status = "review_required";
    addRunEvent(
      run,
      `${task.id} status manually changed from ${previous} to ${status}.`,
      "warning",
      { humanOverride: true },
    );
    return saveAndPublish(run);
  }

  return {
    accept,
    approvePlan,
    approveShape,
    approveSpec,
    approveTickets,
    archive,
    cancel,
    create,
    decideRevisionCommit,
    generatePlan,
    generateSpec,
    generateTickets,
    get,
    getWorkerDetail,
    inspectRepository,
    list,
    linkShapeSession,
    refreshShapeDocumentation,
    openFile,
    pause,
    retry,
    recoverTicket,
    savePlan,
    saveShape,
    saveShapeDomainProposal,
    saveSpec,
    saveTickets,
    setTaskStatus,
    start,
    updateRouting,
    updateIntegrationRepairLimits,
    updateTicketAttemptBudget,
  };
}

module.exports = { createManagedRunService, planningPrompt };
