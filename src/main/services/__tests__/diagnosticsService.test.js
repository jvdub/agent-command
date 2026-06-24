/** @jest-environment node */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createDiagnosticsService } = require("../diagnosticsService");

describe("diagnosticsService", () => {
  let userDataDir;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-diagnostics-"));
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("writes a persistent log and returns a support bundle", () => {
    const service = createDiagnosticsService({
      app: {
        getName: () => "Agentic Command",
        getPath: () => userDataDir,
        getVersion: () => "0.1.0",
      },
    });

    service.log("info", "test-event", { ok: true });

    expect(fs.readFileSync(service.getLogFile(), "utf8")).toContain(
      '"event":"test-event"',
    );
    expect(service.getDiagnostics()).toContain("Product: Agentic Command 0.1.0");
    expect(service.getDiagnostics()).toContain("test-event");
  });
});
