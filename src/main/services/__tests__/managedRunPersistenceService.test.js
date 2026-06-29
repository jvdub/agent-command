const fs = require("fs");
const os = require("os");
const path = require("path");
const {
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
});
