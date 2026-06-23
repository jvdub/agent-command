const fs = require("fs");
const path = require("path");
const { boundTerminalBuffer } = require("./boundedBuffer");

const ENCRYPTED_OUTPUT_ENCODING = "electron-safe-storage-v1";

function createSessionPersistenceService({ app, safeStorage, sessions }) {
  function canProtectOutput() {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  }

  function protectOutputBuffer(value) {
    const output = boundTerminalBuffer(value);
    if (!output || !canProtectOutput()) {
      return null;
    }

    try {
      return {
        encoding: ENCRYPTED_OUTPUT_ENCODING,
        data: safeStorage.encryptString(output).toString("base64"),
      };
    } catch (error) {
      console.warn("Terminal history could not be protected and was not persisted:", error);
      return null;
    }
  }

  function restoreOutputBuffer(value) {
    // Migrate legacy plaintext session files on their next save.
    if (typeof value === "string") {
      return boundTerminalBuffer(value);
    }

    if (
      !value ||
      value.encoding !== ENCRYPTED_OUTPUT_ENCODING ||
      typeof value.data !== "string" ||
      !canProtectOutput()
    ) {
      return "";
    }

    try {
      return boundTerminalBuffer(
        safeStorage.decryptString(Buffer.from(value.data, "base64")),
      );
    } catch (error) {
      console.warn("Protected terminal history could not be restored:", error);
      return "";
    }
  }

  function getSessionStoreFile() {
    return path.join(app.getPath("userData"), "sessions.json");
  }

  function ensureSessionStoreDir() {
    const dir = path.dirname(getSessionStoreFile());
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  function loadSessionsFromDisk() {
    try {
      const storeFile = getSessionStoreFile();
      if (!fs.existsSync(storeFile)) {
        return;
      }

      const data = fs.readFileSync(storeFile, "utf-8");
      const stored = JSON.parse(data);
      if (!Array.isArray(stored)) {
        return;
      }

      let shouldMigrateLegacyOutput = false;
      for (const sessionData of stored) {
        if (typeof sessionData.outputBuffer === "string") {
          shouldMigrateLegacyOutput = true;
        }
        sessions.set(sessionData.id, {
          id: sessionData.id,
          ptyProcess: null,
          label: sessionData.label,
          cwd: sessionData.cwd,
          command: sessionData.command,
          args: sessionData.args || [],
          outputBuffer: restoreOutputBuffer(sessionData.outputBuffer),
          createdAt: sessionData.createdAt,
          isRunning: false,
          endedAt: sessionData.endedAt || null,
          exitCode: sessionData.exitCode || null,
          signal: sessionData.signal || null,
          dispose() {},
        });
      }

      if (shouldMigrateLegacyOutput) {
        saveSessionsToDisk();
      }
    } catch (error) {
      console.error("Failed to load sessions from disk:", error);
    }
  }

  function saveSessionsToDisk() {
    try {
      ensureSessionStoreDir();
      const sessionArray = Array.from(sessions.values()).map((session) => ({
        id: session.id,
        label: session.label,
        cwd: session.cwd,
        command: session.command,
        args: session.args,
        outputBuffer: protectOutputBuffer(session.outputBuffer),
        createdAt: session.createdAt,
        isRunning: session.isRunning,
        endedAt: session.endedAt,
        exitCode: session.exitCode,
        signal: session.signal,
      }));

      fs.writeFileSync(
        getSessionStoreFile(),
        JSON.stringify(sessionArray, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save sessions to disk:", error);
    }
  }

  function deleteSessionFromDisk(sessionId) {
    sessions.delete(sessionId);
    saveSessionsToDisk();
  }

  return {
    deleteSessionFromDisk,
    loadSessionsFromDisk,
    saveSessionsToDisk,
  };
}

module.exports = {
  ENCRYPTED_OUTPUT_ENCODING,
  createSessionPersistenceService,
};
