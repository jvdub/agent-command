const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  MANAGED_RUN_SCHEMA_VERSION,
  createManagedRunPersistenceService,
} = require("../managedRunPersistenceService");

describe("Managed Run persistence", () => {
  let userDataDir;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-run-store-"));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  function safeStorage() {
    return {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`protected:${value}`, "utf8"),
      decryptString: (value) =>
        value.toString("utf8").replace(/^protected:/u, ""),
    };
  }

  test("protects worker prompts and output and restores interrupted state safely", () => {
    const runs = new Map([
      [
        "run-1",
        {
          id: "run-1",
          status: "running",
          activeWorkerId: "worker-1",
          events: [],
          workers: [
            {
              id: "worker-1",
              prompt: "sensitive prompt",
              stdout: "sensitive output",
              stderr: "sensitive error",
            },
          ],
        },
      ],
    ]);
    const app = { getPath: () => userDataDir };
    const service = createManagedRunPersistenceService({
      app,
      safeStorage: safeStorage(),
      runs,
      platform: "win32",
    });
    service.save();

    const raw = fs.readFileSync(service.storeFile(), "utf8");
    expect(raw).not.toContain("sensitive prompt");
    expect(raw).not.toContain("sensitive output");

    const restored = new Map();
    createManagedRunPersistenceService({
      app,
      safeStorage: safeStorage(),
      runs: restored,
      platform: "win32",
    }).load();

    expect(restored.get("run-1").workers[0].prompt).toBe("sensitive prompt");
    expect(restored.get("run-1").workers[0].stdout).toBe("sensitive output");
    expect(restored.get("run-1").status).toBe("review_required");
    expect(restored.get("run-1").activeWorkerId).toBeNull();
  });

  test("migrates an approved legacy plan to an explicitly best-effort snapshot", () => {
    const app = { getPath: () => userDataDir };
    const target = path.join(userDataDir, "managed-runs.json");
    fs.writeFileSync(
      target,
      JSON.stringify({
        schemaVersion: 1,
        runs: [{
          id: "legacy",
          status: "completed",
          planRevision: 3,
          approvedRevision: 3,
          approvedAt: "2026-06-30T12:00:00.000Z",
          plan: {
            objective: "Legacy goal",
            tasks: [{ id: "task-1", title: "Build", objective: "Build it" }],
          },
          tasks: [{
            id: "task-1",
            title: "Build",
            objective: "Build it",
            status: "succeeded",
            attempts: [{ number: 1 }],
          }],
          workers: [],
          events: [],
        }],
      }),
      "utf8",
    );

    const restored = new Map();
    createManagedRunPersistenceService({
      app,
      safeStorage: safeStorage(),
      runs: restored,
      platform: "win32",
    }).load();

    expect(MANAGED_RUN_SCHEMA_VERSION).toBe(2);
    expect(restored.get("legacy").approvedPlanSnapshot).toMatchObject({
      revision: 3,
      provenance: "migrated-best-effort",
    });
    expect(restored.get("legacy").approvedPlanSnapshot.tasks[0]).not.toHaveProperty("status");
  });

  test("marks prompts unavailable when protected storage cannot persist them", () => {
    const app = { getPath: () => userDataDir };
    const runs = new Map([["run-1", {
      id: "run-1",
      status: "completed",
      workers: [{ id: "worker-1", prompt: "secret", stdout: "output", stderr: "" }],
      events: [],
    }]]);
    const unavailableStorage = { isEncryptionAvailable: () => false };
    createManagedRunPersistenceService({
      app,
      safeStorage: unavailableStorage,
      runs,
      platform: "win32",
    }).save();
    const restored = new Map();
    createManagedRunPersistenceService({
      app,
      safeStorage: unavailableStorage,
      runs: restored,
      platform: "win32",
    }).load();
    expect(restored.get("run-1").workers[0]).toMatchObject({
      prompt: "",
      promptAvailability: "not_persisted",
    });
  });
});
