const fs = require("fs");
const path = require("path");

function resolveInitialDirectory({
  argv = process.argv,
  fallbackCwd = process.cwd(),
} = {}) {
  const candidate = argv
    .slice(1)
    .find(
      (value) =>
        value &&
        !value.startsWith("-") &&
        fs.existsSync(value) &&
        fs.statSync(value).isDirectory(),
    );

  return candidate ? path.resolve(candidate) : fallbackCwd;
}

function shellForPlatform(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return env.COMSPEC || "cmd.exe";
  }

  return env.SHELL || "/bin/bash";
}

function shellArgsForPlatform(platform = process.platform) {
  if (platform === "win32") {
    return ["-NoLogo", "-NoExit"];
  }

  if (platform === "darwin") {
    return ["-l"];
  }

  return ["-i"];
}

function interactiveShellForPlatform(
  platform = process.platform,
  env = process.env,
) {
  if (platform === "win32") {
    return "powershell.exe";
  }

  return env.SHELL || "/bin/bash";
}

function buildPtyEnv(
  overrides = {},
  env = process.env,
  platform = process.platform,
) {
  const editorFallback = platform === "win32" ? "notepad" : "vi";
  const editor = env.GIT_EDITOR || env.VISUAL || env.EDITOR || editorFallback;

  return {
    ...env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    ELECTRON_RUN_AS_NODE: undefined,
    EDITOR: editor,
    VISUAL: editor,
    GIT_TERMINAL_PROMPT: "1",
    ...overrides,
  };
}

function splitArgs(value = "") {
  const result = [];
  let current = "";
  let quote = null;
  let escaping = false;

  for (const char of String(value).trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    result.push(current);
  }

  return result;
}

module.exports = {
  buildPtyEnv,
  interactiveShellForPlatform,
  resolveInitialDirectory,
  shellArgsForPlatform,
  shellForPlatform,
  splitArgs,
};
