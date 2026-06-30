const { buildWorkerEnvironment } = require("../workerProcessService");

describe("worker process environment", () => {
  test("does not leak the parent Codex sandbox context into child workers", () => {
    const environment = buildWorkerEnvironment({
      PATH: "test-path",
      CODEX_HOME: "test-home",
      CODEX_SANDBOX_NETWORK_DISABLED: "1",
      CODEX_THREAD_ID: "parent-thread",
    });

    expect(environment).toEqual({
      PATH: "test-path",
      CODEX_HOME: "test-home",
    });
  });
});
