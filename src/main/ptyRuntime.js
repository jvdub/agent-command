function quoteWindowsCmdArg(value) {
  const text = String(value || "");
  if (!text) {
    return '""';
  }

  if (!/[\s"^&|<>()%!]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildWindowsCommandLine(command, args) {
  return [command, ...args].map(quoteWindowsCmdArg).join(" ");
}

function spawnSessionPty(pty, command, args, options) {
  try {
    return pty.spawn(command, args, options);
  } catch (error) {
    const shouldFallback =
      process.platform === "win32" &&
      error &&
      (error.code === "ENOENT" || /not found/i.test(String(error.message)));

    if (!shouldFallback) {
      throw error;
    }

    const comspec = process.env.COMSPEC || "cmd.exe";
    const commandLine = buildWindowsCommandLine(command, args);
    return pty.spawn(comspec, ["/d", "/s", "/c", commandLine], options);
  }
}

module.exports = {
  spawnSessionPty,
};
