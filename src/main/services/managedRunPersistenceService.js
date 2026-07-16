const fs = require("fs");
const path = require("path");
const {
  createApprovedPlanSnapshot,
  createRuntimeTasks,
} = require("./managedRunUtils");

const MANAGED_RUN_SCHEMA_VERSION = 3;
const ENCRYPTED_TRANSCRIPT_ENCODING = "electron-safe-storage-v1";

function createManagedRunPersistenceService({
  app,
  safeStorage,
  runs,
  platform = process.platform,
}) {
  function storeFile() {
    return path.join(app.getPath("userData"), "managed-runs.json");
  }

  function canProtectTranscripts() {
    try {
      if (!safeStorage?.isEncryptionAvailable?.()) return false;
      if (platform === "linux") {
        const backend = safeStorage.getSelectedStorageBackend?.();
        return Boolean(backend && !["basic_text", "unknown"].includes(backend));
      }
      return true;
    } catch {
      return false;
    }
  }

  function protect(value) {
    if (!value || !canProtectTranscripts()) return null;
    try {
      return {
        encoding: ENCRYPTED_TRANSCRIPT_ENCODING,
        data: safeStorage.encryptString(String(value)).toString("base64"),
      };
    } catch {
      return null;
    }
  }

  function restore(value) {
    if (
      !value ||
      value.encoding !== ENCRYPTED_TRANSCRIPT_ENCODING ||
      !canProtectTranscripts()
    ) {
      return "";
    }
    try {
      return safeStorage.decryptString(Buffer.from(value.data, "base64"));
    } catch {
      return "";
    }
  }

  function serializeRun(run) {
    return {
      ...run,
      workers: run.workers.map((worker) => ({
        ...worker,
        promptAvailability: worker.prompt && canProtectTranscripts()
          ? "available"
          : "not_persisted",
        prompt: protect(worker.prompt),
        stdout: protect(worker.stdout),
        stderr: protect(worker.stderr),
      })),
    };
  }

  function save() {
    const target = storeFile();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(
      temporary,
      JSON.stringify(
        {
          schemaVersion: MANAGED_RUN_SCHEMA_VERSION,
          runs: Array.from(runs.values()).map(serializeRun),
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.renameSync(temporary, target);
  }

  function load() {
    const target = storeFile();
    if (!fs.existsSync(target)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
      if (parsed?.schemaVersion !== MANAGED_RUN_SCHEMA_VERSION) return;
      if (!Array.isArray(parsed?.runs)) return;
      for (const stored of parsed.runs) {
        const run = {
          ...stored,
          workers: (stored.workers || []).map((worker) => ({
            ...worker,
            prompt: restore(worker.prompt),
            promptAvailability: worker.prompt
              ? (restore(worker.prompt) ? "available" : "not_persisted")
              : (worker.promptAvailability || "not_persisted"),
            stdout: restore(worker.stdout),
            stderr: restore(worker.stderr),
          })),
        };
        if (!run.approvedPlanSnapshot && run.approvedRevision === run.planRevision && run.plan) {
          run.approvedPlanSnapshot = createApprovedPlanSnapshot(run.plan, {
            revision: run.approvedRevision,
            approvedAt: run.approvedAt,
            provenance: "migrated-best-effort",
          });
        }
        if (run.plan?.tasks && run.tasks === run.plan.tasks) {
          run.tasks = createRuntimeTasks(run.tasks);
        }
        if (["planning", "running", "final_verification"].includes(run.status)) {
          run.status = "review_required";
          run.activeWorkerId = null;
          run.events = run.events || [];
          run.events.push({
            id: `recovery-${Date.now()}`,
            at: new Date().toISOString(),
            level: "warning",
            message: "An in-flight worker was interrupted by application restart.",
            detail: null,
          });
        }
        runs.set(run.id, run);
      }
    } catch (error) {
      console.error("Failed to load Managed Runs:", error);
    }
  }

  return {
    canProtectTranscripts,
    load,
    save,
    storeFile,
  };
}

module.exports = {
  ENCRYPTED_TRANSCRIPT_ENCODING,
  MANAGED_RUN_SCHEMA_VERSION,
  createManagedRunPersistenceService,
};
