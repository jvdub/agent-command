const {
  createWorkerProviderRegistry,
} = require("../workerProviderRegistry");

describe("Managed Run worker provider routing", () => {
  function registry() {
    return createWorkerProviderRegistry({
      env: {
        AGENTIC_MANAGED_DEFAULT_PROVIDER: "codex",
        AGENTIC_MANAGED_CODEX_DEFAULT_MODEL: "codex-default",
        AGENTIC_MANAGED_CODEX_ECONOMY_MODEL: "codex-economy",
      },
    });
  }

  test("omits --model for the configured provider default", () => {
    const launch = registry().buildLaunch({
      role: "implementer",
      selection: { provider: "codex", model: "codex-default" },
    });

    expect(launch.modelFlagUsed).toBe(false);
    expect(launch.args).not.toContain("--model");
    expect(launch.permissionMode).toBe("workspace-write");
  });

  test("uses --model with the exact non-default model", () => {
    const launch = registry().buildLaunch({
      role: "verifier",
      selection: { provider: "codex", model: "codex-special" },
    });

    const modelIndex = launch.args.indexOf("--model");
    expect(modelIndex).toBeGreaterThan(-1);
    expect(launch.args[modelIndex + 1]).toBe("codex-special");
    expect(launch.modelFlagUsed).toBe(true);
    expect(launch.permissionMode).toBe("read-only");
  });

  test("resolves a tier model and protects OpenCode read-only roles", () => {
    const tierLaunch = registry().buildLaunch({
      role: "implementer",
      selection: { provider: "codex", tier: "economy" },
    });
    expect(tierLaunch.model).toBe("codex-economy");
    expect(tierLaunch.modelFlagUsed).toBe(true);

    const opencode = registry().buildLaunch({
      role: "verifier",
      selection: { provider: "opencode" },
    });
    expect(opencode.args).toEqual(
      expect.arrayContaining(["run", "--agent", "plan"]),
    );
  });
});
