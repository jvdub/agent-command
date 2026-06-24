const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_LOG_BYTES = 1024 * 1024;
const DIAGNOSTIC_TAIL_BYTES = 64 * 1024;

function createDiagnosticsService({ app }) {
  function getDataDirectory() {
    return app.getPath("userData");
  }

  function getLogFile() {
    return path.join(getDataDirectory(), "agentic-command.log");
  }

  function ensureDataDirectory() {
    fs.mkdirSync(getDataDirectory(), { recursive: true });
  }

  function rotateLogIfNeeded() {
    const logFile = getLogFile();
    if (!fs.existsSync(logFile) || fs.statSync(logFile).size < MAX_LOG_BYTES) {
      return;
    }

    const previousLog = `${logFile}.1`;
    fs.rmSync(previousLog, { force: true });
    fs.renameSync(logFile, previousLog);
  }

  function serializeDetails(details) {
    if (details instanceof Error) {
      return {
        message: details.message,
        name: details.name,
        stack: details.stack,
      };
    }

    return details && typeof details === "object" ? details : { value: details };
  }

  function log(level, event, details = {}) {
    try {
      ensureDataDirectory();
      rotateLogIfNeeded();
      fs.appendFileSync(
        getLogFile(),
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          event,
          details: serializeDetails(details),
        })}\n`,
        "utf8",
      );
    } catch (error) {
      console.error("Unable to write application diagnostics:", error);
    }
  }

  function readLogTail() {
    try {
      const logFile = getLogFile();
      if (!fs.existsSync(logFile)) {
        return "No application log has been written yet.";
      }

      const data = fs.readFileSync(logFile);
      return data.subarray(Math.max(0, data.length - DIAGNOSTIC_TAIL_BYTES)).toString("utf8");
    } catch (error) {
      return `Unable to read application log: ${error.message || String(error)}`;
    }
  }

  function getDiagnostics() {
    return [
      `Product: ${app.getName()} ${app.getVersion()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `OS: ${os.type()} ${os.release()}`,
      `Electron: ${process.versions.electron || "unknown"}`,
      `Node: ${process.versions.node}`,
      `Data directory: ${getDataDirectory()}`,
      "",
      "Recent application log:",
      readLogTail(),
    ].join("\n");
  }

  return {
    getDataDirectory,
    getDiagnostics,
    getLogFile,
    log,
  };
}

module.exports = {
  createDiagnosticsService,
};
