const { IPC_CHANNELS } = require("../../shared/ipcContract");

function registerHandlers(registry, services) {
  const { managedRunService } = services;

  registry.register("managed-runs", IPC_CHANNELS.invoke.createManagedRun, {
    handler: async (_event, payload) => managedRunService.create(payload),
  });
  registry.register(
    "managed-runs",
    IPC_CHANNELS.invoke.inspectManagedRunRepository,
    {
      handler: async (_event, repoPath) =>
        managedRunService.inspectRepository(repoPath),
    },
  );
  registry.register("managed-runs", IPC_CHANNELS.invoke.listManagedRuns, {
    handler: async (_event, options) => ({ runs: managedRunService.list(options) }),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.getManagedRun, {
    handler: async (_event, runId) => managedRunService.get(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.getManagedRunWorkerDetail, {
    handler: async (_event, payload) =>
      managedRunService.getWorkerDetail(payload?.runId, payload?.workerId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.openManagedRunFile, {
    handler: async (_event, payload) =>
      managedRunService.openFile(payload?.runId, payload?.filePath),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.linkManagedRunShapeSession, {
    handler: async (_event, payload) => managedRunService.linkShapeSession(payload?.runId, payload?.sessionId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.saveManagedRunShape, {
    handler: async (_event, payload) => managedRunService.saveShape(payload?.runId, payload?.markdown),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.approveManagedRunShape, {
    handler: async (_event, payload) => managedRunService.approveShape(payload?.runId || payload, payload?.options),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.saveManagedRunShapeDomainProposal, {
    handler: async (_event, payload) => managedRunService.saveShapeDomainProposal(payload?.runId, payload?.markdown),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.refreshManagedRunShapeDocumentation, {
    handler: async (_event, payload) => managedRunService.refreshShapeDocumentation(payload?.runId, payload?.options),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.generateManagedRunSpec, {
    handler: async (_event, runId) => managedRunService.generateSpec(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.saveManagedRunSpec, {
    handler: async (_event, payload) => managedRunService.saveSpec(payload?.runId, payload?.markdown),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.approveManagedRunSpec, {
    handler: async (_event, payload) => managedRunService.approveSpec(payload?.runId, payload?.options),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.generateManagedRunTickets, {
    handler: async (_event, runId) => managedRunService.generateTickets(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.saveManagedRunTickets, {
    handler: async (_event, payload) => managedRunService.saveTickets(payload?.runId, payload?.markdown),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.approveManagedRunTickets, {
    handler: async (_event, runId) => managedRunService.approveTickets(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.decideManagedRunRevisionCommit, {
    handler: async (_event, payload) => managedRunService.decideRevisionCommit(
      payload?.runId, payload?.ticketId, payload?.disposition, payload?.reversalTicketId,
    ),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.generateManagedRunPlan, {
    handler: async (_event, runId) => managedRunService.generatePlan(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.saveManagedRunPlan, {
    handler: async (_event, payload) =>
      managedRunService.savePlan(payload?.runId, payload?.plan),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.approveManagedRunPlan, {
    handler: async (_event, runId) => managedRunService.approvePlan(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.startManagedRun, {
    handler: async (_event, runId) => managedRunService.start(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.pauseManagedRun, {
    handler: async (_event, runId) => managedRunService.pause(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.cancelManagedRun, {
    handler: async (_event, runId) => managedRunService.cancel(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.retryManagedRunTask, {
    handler: async (_event, payload) => managedRunService.retry(payload?.runId, payload?.taskId || null),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.updateManagedRunTicketBudget, {
    handler: async (_event, payload) => managedRunService.updateTicketAttemptBudget(payload?.runId, payload?.taskId, payload?.maxAttempts),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.updateManagedRunIntegrationLimits, {
    handler: async (_event, payload) => managedRunService.updateIntegrationRepairLimits(payload?.runId, { cycles: payload?.cycles, attempts: payload?.attempts }),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.recoverManagedRunTicket, {
    handler: async (_event, payload) => managedRunService.recoverTicket(payload?.runId, payload?.taskId, payload?.action, payload?.confirmed),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.updateManagedRunRouting, {
    handler: async (_event, payload) =>
      managedRunService.updateRouting(payload?.runId, payload?.routing),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.previewManagedRunAcceptance, {
    handler: async (_event, runId) => managedRunService.previewAcceptance(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.acceptManagedRun, {
    handler: async (_event, payload) => managedRunService.accept(payload?.runId || payload, payload?.options),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.previewManagedRunCleanup, { handler: async (_event, runId) => managedRunService.previewCleanup(runId) });
  registry.register("managed-runs", IPC_CHANNELS.invoke.cleanupManagedRun, { handler: async (_event, payload) => managedRunService.cleanup(payload?.runId, payload?.options) });
  registry.register("managed-runs", IPC_CHANNELS.invoke.archiveManagedRun, {
    handler: async (_event, runId) => managedRunService.archive(runId),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.setManagedRunTaskStatus, {
    handler: async (_event, payload) =>
      managedRunService.setTaskStatus(
        payload?.runId,
        payload?.taskId,
        payload?.status,
      ),
  });
}

module.exports = { registerHandlers };
