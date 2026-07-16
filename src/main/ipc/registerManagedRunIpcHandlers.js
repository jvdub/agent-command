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
    handler: async () => ({ runs: managedRunService.list() }),
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
    handler: async (_event, payload) =>
      managedRunService.retry(payload?.runId, payload?.taskId || null),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.updateManagedRunRouting, {
    handler: async (_event, payload) =>
      managedRunService.updateRouting(payload?.runId, payload?.routing),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.acceptManagedRun, {
    handler: async (_event, runId) => managedRunService.accept(runId),
  });
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
