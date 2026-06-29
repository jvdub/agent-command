const { IPC_CHANNELS } = require("../../shared/ipcContract");

function registerHandlers(registry, services) {
  const { managedRunService } = services;

  registry.register("managed-runs", IPC_CHANNELS.invoke.createManagedRun, {
    handler: async (_event, payload) => managedRunService.create(payload),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.listManagedRuns, {
    handler: async () => ({ runs: managedRunService.list() }),
  });
  registry.register("managed-runs", IPC_CHANNELS.invoke.getManagedRun, {
    handler: async (_event, runId) => managedRunService.get(runId),
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
