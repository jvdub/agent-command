const { createWorkerProviderRegistry } = require("../workerProviderRegistry");

test("a configured worker command prefix runs before provider arguments", () => {
  const registry = createWorkerProviderRegistry({
    env: {
      AGENTIC_MANAGED_DEFAULT_PROVIDER: "codex",
      AGENTIC_MANAGED_CODEX_COMMAND: "node",
      AGENTIC_MANAGED_CODEX_COMMAND_ARGS: '["fake-spec-worker.js"]',
    },
  });
  const launch = registry.buildLaunch({ role: "planner", selection: { provider: "codex" } });

  expect(launch.command).toBe("node");
  expect(launch.args[0]).toBe("fake-spec-worker.js");
  expect(launch.args).toEqual(expect.arrayContaining(["exec", "--sandbox", "read-only"]));
});
