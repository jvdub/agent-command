export const MAX_TERMINAL_BUFFER_CHARS = 1024 * 1024;

export function appendBoundedBuffer(
  currentValue,
  chunk,
  maxChars = MAX_TERMINAL_BUFFER_CHARS,
) {
  const combined = `${currentValue || ""}${chunk || ""}`;
  if (combined.length <= maxChars) {
    return combined;
  }

  return combined.slice(-maxChars);
}

export function boundTerminalBuffer(
  value,
  maxChars = MAX_TERMINAL_BUFFER_CHARS,
) {
  const normalized = String(value || "");
  return normalized.length <= maxChars
    ? normalized
    : normalized.slice(-maxChars);
}
