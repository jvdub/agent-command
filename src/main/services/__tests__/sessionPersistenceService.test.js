/** @jest-environment node */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ENCRYPTED_OUTPUT_ENCODING,
  SESSION_STORE_SCHEMA_VERSION,
  createSessionPersistenceService,
} = require("../sessionPersistenceService");

describe("sessionPersistenceService", () => {
  let userDataDir;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-command-"));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  function createService(sessions, safeStorage, platform = "win32") {
    return createSessionPersistenceService({
      app: { getPath: () => userDataDir },
      safeStorage,
      sessions,
      platform,
    });
  }

  function readStore() {
    return JSON.parse(
      fs.readFileSync(path.join(userDataDir, "sessions.json"), "utf8"),
    );
  }

  test("protects terminal output at rest and restores it", () => {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`protected:${value}`, "utf8"),
      decryptString: (value) => value.toString("utf8").replace(/^protected:/, ""),
    };
    const sessions = new Map([
      ["session-1", {
        id: "session-1",
        label: "Protected",
        cwd: "/repo",
        command: "agent",
        args: [],
        outputBuffer: "sensitive terminal output",
        createdAt: 1,
        exitCode: 0,
        isRunning: false,
      }],
    ]);
    const service = createService(sessions, safeStorage);

    service.saveSessionsToDisk();
    const raw = fs.readFileSync(path.join(userDataDir, "sessions.json"), "utf8");
    expect(raw).not.toContain("sensitive terminal output");
    expect(readStore().schemaVersion).toBe(SESSION_STORE_SCHEMA_VERSION);
    expect(readStore().sessions[0].outputBuffer.encoding).toBe(
      ENCRYPTED_OUTPUT_ENCODING,
    );

    sessions.clear();
    service.loadSessionsFromDisk();
    expect(sessions.get("session-1").outputBuffer).toBe("sensitive terminal output");
    expect(sessions.get("session-1").exitCode).toBe(0);
  });

  test("does not persist terminal output when encryption is unavailable", () => {
    const sessions = new Map([
      ["session-1", {
        id: "session-1",
        label: "Unprotected",
        cwd: "/repo",
        command: "agent",
        args: [],
        outputBuffer: "do not write this",
        createdAt: 1,
        isRunning: false,
      }],
    ]);
    const service = createService(sessions, {
      isEncryptionAvailable: () => false,
    });

    service.saveSessionsToDisk();
    const raw = fs.readFileSync(path.join(userDataDir, "sessions.json"), "utf8");
    expect(raw).not.toContain("do not write this");
    expect(readStore().sessions[0].outputBuffer).toBeNull();
  });

  test("does not persist terminal output with Linux basic-text storage", () => {
    const sessions = new Map([
      ["session-1", {
        id: "session-1",
        label: "Linux without a keyring",
        cwd: "/repo",
        command: "agent",
        args: [],
        outputBuffer: "do not write this",
        createdAt: 1,
        isRunning: false,
      }],
    ]);
    const safeStorage = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "basic_text",
    };

    createService(sessions, safeStorage, "linux").saveSessionsToDisk();

    const raw = fs.readFileSync(path.join(userDataDir, "sessions.json"), "utf8");
    expect(raw).not.toContain("do not write this");
    expect(readStore().sessions[0].outputBuffer).toBeNull();
  });

  test("migrates legacy plaintext output when sessions are loaded", () => {
    fs.writeFileSync(
      path.join(userDataDir, "sessions.json"),
      JSON.stringify([
        {
          id: "session-1",
          label: "Legacy",
          cwd: "/repo",
          command: "agent",
          args: [],
          outputBuffer: "legacy plaintext",
          createdAt: 1,
        },
      ]),
      "utf8",
    );
    const sessions = new Map();
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`protected:${value}`, "utf8"),
      decryptString: (value) => value.toString("utf8").replace(/^protected:/, ""),
    };

    createService(sessions, safeStorage).loadSessionsFromDisk();

    expect(sessions.get("session-1").outputBuffer).toBe("legacy plaintext");
    const migrated = fs.readFileSync(
      path.join(userDataDir, "sessions.json"),
      "utf8",
    );
    expect(migrated).not.toContain("legacy plaintext");
    expect(JSON.parse(migrated).schemaVersion).toBe(
      SESSION_STORE_SCHEMA_VERSION,
    );
    expect(JSON.parse(migrated).sessions[0].outputBuffer.encoding).toBe(
      ENCRYPTED_OUTPUT_ENCODING,
    );
  });
});
