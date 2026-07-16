const VALID_ROLES = new Set([
  "planner",
  "implementer",
  "verifier",
  "integration_verifier",
]);

function readProviderConfiguration(env = process.env) {
  const defaultProvider = env.AGENTIC_MANAGED_DEFAULT_PROVIDER || "codex";
  return {
    defaultProvider,
    providers: {
      codex: {
        command: env.AGENTIC_MANAGED_CODEX_COMMAND || "codex",
        commandArgs: JSON.parse(env.AGENTIC_MANAGED_CODEX_COMMAND_ARGS || "[]"),
        defaultModel: env.AGENTIC_MANAGED_CODEX_DEFAULT_MODEL || "",
        tierModels: {
          economy: env.AGENTIC_MANAGED_CODEX_ECONOMY_MODEL || "",
          standard: env.AGENTIC_MANAGED_CODEX_STANDARD_MODEL || "",
          premium: env.AGENTIC_MANAGED_CODEX_PREMIUM_MODEL || "",
        },
      },
      claude: {
        command: env.AGENTIC_MANAGED_CLAUDE_COMMAND || "claude",
        commandArgs: JSON.parse(env.AGENTIC_MANAGED_CLAUDE_COMMAND_ARGS || "[]"),
        defaultModel: env.AGENTIC_MANAGED_CLAUDE_DEFAULT_MODEL || "",
        tierModels: {
          economy: env.AGENTIC_MANAGED_CLAUDE_ECONOMY_MODEL || "",
          standard: env.AGENTIC_MANAGED_CLAUDE_STANDARD_MODEL || "",
          premium: env.AGENTIC_MANAGED_CLAUDE_PREMIUM_MODEL || "",
        },
      },
      opencode: {
        command: env.AGENTIC_MANAGED_OPENCODE_COMMAND || "opencode",
        commandArgs: JSON.parse(env.AGENTIC_MANAGED_OPENCODE_COMMAND_ARGS || "[]"),
        defaultModel: env.AGENTIC_MANAGED_OPENCODE_DEFAULT_MODEL || "",
        tierModels: {
          economy: env.AGENTIC_MANAGED_OPENCODE_ECONOMY_MODEL || "",
          standard: env.AGENTIC_MANAGED_OPENCODE_STANDARD_MODEL || "",
          premium: env.AGENTIC_MANAGED_OPENCODE_PREMIUM_MODEL || "",
        },
      },
    },
  };
}

function quotePreview(value) {
  const text = String(value);
  return /[\s"]/u.test(text) ? `"${text.replaceAll('"', '\\"')}"` : text;
}

function createWorkerProviderRegistry({ env = process.env } = {}) {
  const configuration = readProviderConfiguration(env);

  function resolveSelection(selection = {}) {
    const providerName = selection.provider || configuration.defaultProvider;
    const provider = configuration.providers[providerName];
    if (!provider) {
      throw new Error(`Unsupported worker provider: ${providerName}`);
    }
    const tier = selection.tier || "standard";
    const explicitModel = String(selection.model || "").trim();
    const tierModel = String(provider.tierModels[tier] || "").trim();
    const model = explicitModel || tierModel || provider.defaultModel;
    const usesDefaultModel = !model || model === provider.defaultModel;
    return {
      provider: providerName,
      tier,
      model,
      defaultModel: provider.defaultModel,
      usesDefaultModel,
      command: provider.command,
      commandArgs: [...provider.commandArgs],
    };
  }

  function buildLaunch({ role, selection }) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Unsupported worker role: ${role}`);
    }
    const resolved = resolveSelection(selection);
    const writable = role === "implementer";
    let args = [...resolved.commandArgs];

    if (resolved.provider === "codex") {
      args.push("--ask-for-approval", "never");
      if (!resolved.usesDefaultModel) {
        args.push("--model", resolved.model);
      }
      args.push(
        "exec",
        "--ephemeral",
        "--sandbox",
        writable ? "workspace-write" : "read-only",
        "-",
      );
    } else if (resolved.provider === "claude") {
      args.push("-p", "--output-format", "json");
      if (!resolved.usesDefaultModel) {
        args.push("--model", resolved.model);
      }
      args.push(
        "--permission-mode",
        writable ? "acceptEdits" : "plan",
        "--max-turns",
        writable ? "30" : "20",
      );
    } else {
      args.push("run", "--agent", writable ? "build" : "plan");
      if (!resolved.usesDefaultModel) {
        args.push("--model", resolved.model);
      }
    }

    return {
      ...resolved,
      role,
      args,
      modelFlagUsed: !resolved.usesDefaultModel,
      permissionMode: writable ? "workspace-write" : "read-only",
      preview: [resolved.command, ...args].map(quotePreview).join(" "),
    };
  }

  function getConfiguration() {
    return JSON.parse(JSON.stringify(configuration));
  }

  return {
    buildLaunch,
    getConfiguration,
    resolveSelection,
  };
}

module.exports = {
  createWorkerProviderRegistry,
  readProviderConfiguration,
};
