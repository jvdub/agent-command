function hasExternalScheme(value) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !/^[a-z]:[\\/]/i.test(value) &&
    !/^(?:file|vscode):/i.test(value)
  );
}

function parseFileTarget(value) {
  let filePath = String(value || "").trim();
  let lineNumber = null;
  const fragment = filePath.match(/#L(\d+)(?:C\d+)?$/i);
  if (fragment) {
    lineNumber = Number(fragment[1]);
    filePath = filePath.slice(0, fragment.index);
  }

  filePath = filePath
    .replace(/^vscode:\/\/file\//i, "file:///")
    .replace(/^file:\/\//i, "");
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // Preserve malformed escapes so resolution reports the original target.
  }
  if (/^\/[a-z]:\//i.test(filePath)) {
    filePath = filePath.slice(1);
  }

  const suffix = filePath.match(/:(\d+)(?::\d+)?$/);
  if (suffix && !/^[a-z]:$/i.test(filePath.slice(0, suffix.index))) {
    lineNumber ??= Number(suffix[1]);
    filePath = filePath.slice(0, suffix.index);
  }
  return { filePath, lineNumber };
}

export async function activateTerminalLink(
  target,
  { openExternalUrl, openWorkspaceFile, resolveWorkspaceFile },
) {
  const value = String(target || "").trim();
  if (hasExternalScheme(value)) {
    await openExternalUrl(value);
    return { kind: "external", target: value };
  }

  const { filePath, lineNumber } = parseFileTarget(value);
  const resolved = await resolveWorkspaceFile(filePath);
  if (!resolved) {
    throw new Error(`File is not in this workspace: ${filePath}`);
  }
  await openWorkspaceFile(resolved.relativePath, lineNumber);
  return { kind: "file", target: resolved.relativePath, lineNumber };
}
