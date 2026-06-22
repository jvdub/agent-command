const fs = require("fs");
const path = require("path");
const { boundTerminalBuffer } = require("./boundedBuffer");

function createSessionPersistenceService({ app, sessions }) {
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

      for (const sessionData of stored) {
        sessions.set(sessionData.id, {
          id: sessionData.id,
          ptyProcess: null,
          label: sessionData.label,
          cwd: sessionData.cwd,
          command: sessionData.command,
          args: sessionData.args || [],
          outputBuffer: boundTerminalBuffer(sessionData.outputBuffer),
          createdAt: sessionData.createdAt,
          isRunning: false,
          endedAt: sessionData.endedAt || null,
          exitCode: sessionData.exitCode || null,
          signal: sessionData.signal || null,
          dispose() {},
        });
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
        outputBuffer: boundTerminalBuffer(session.outputBuffer),
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
  createSessionPersistenceService,
};
