import { LANGUAGE_BY_EXTENSION } from "./constants.js";
import { sessions, uiState } from "./state.js";

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function shortId(sessionId) {
  const parts = String(sessionId).split("-");
  return parts[parts.length - 1] || String(sessionId);
}

export function compactPath(value) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\\\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

export function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function getSessionDisplayName(session) {
  if (session.label && session.label.trim()) {
    return session.label.trim();
  }

  const location = compactPath(session.cwd) || "workspace";
  if (session.args.length > 0) {
    return `${location} · ${truncate(session.args.join(" "), 24)}`;
  }

  return location;
}

export function getProcessDisplayLabel(processInfo) {
  if (processInfo.comm === "node") {
    const script = processInfo.cmdline
      .split(" ")
      .find(
        (token) =>
          token.endsWith(".js") ||
          token.endsWith(".mjs") ||
          token.endsWith(".cjs"),
      );

    return script || "node";
  }

  return processInfo.comm || "process";
}

export function stripAnsi(value) {
  return value
    .replace(/\u001b\[[ -?]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, "")
    .replace(/\u001b./g, "")
    .replace(/\u001b/g, "");
}

export function normalizeCandidateFilePath(candidate) {
  if (!candidate) {
    return "";
  }

  return candidate
    .trim()
    .replace(/^["'`[(]+/, "")
    .replace(/[)'"`\],.;:!?]+$/, "");
}

export function normalizedPathForMatch(pathValue) {
  if (!pathValue) {
    return "";
  }

  let normalized = normalizeCandidateFilePath(pathValue).replace(/\\+/g, "/");
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("a/") || normalized.startsWith("b/")) {
    normalized = normalized.slice(2);
  }

  const hasDrive = /^[A-Za-z]:\//.test(normalized);
  const isAbsolutePosix = normalized.startsWith("/");
  const isUnc = normalized.startsWith("//");
  const isAbsolute = hasDrive || isAbsolutePosix || isUnc;
  const uncPrefix = isUnc ? "//" : "";

  if (isUnc) {
    normalized = normalized.replace(/^\/\/+/, "");
  }

  const root = hasDrive ? normalized.slice(0, 2) : isAbsolutePosix ? "/" : "";
  const body = hasDrive ? normalized.slice(2) : normalized;
  const parts = body.split("/");
  const stack = [];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      const last = stack[stack.length - 1];
      if (last && last !== "..") {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push("..");
      }
      continue;
    }

    stack.push(part);
  }

  const normalizedBody = stack.join("/");

  if (hasDrive) {
    return `${root}${normalizedBody ? `/${normalizedBody}` : ""}`;
  }

  if (isAbsolutePosix) {
    return `/${normalizedBody}`;
  }

  if (isUnc) {
    return `${uncPrefix}${normalizedBody}`;
  }

  return normalizedBody || ".";
}

export function pathBasename(pathValue) {
  const normalized = String(pathValue || "").replace(/\\+/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

export function toRelativeIfUnder(rootPath, candidatePath) {
  const root = normalizedPathForMatch(rootPath);
  const candidate = normalizedPathForMatch(candidatePath);

  if (!root || !candidate) {
    return candidate;
  }

  const rootTrimmed = root.endsWith("/") ? root.slice(0, -1) : root;
  const caseInsensitive = uiState.platformName === "win32";

  const rootCmp = caseInsensitive ? rootTrimmed.toLowerCase() : rootTrimmed;
  const candidateCmp = caseInsensitive ? candidate.toLowerCase() : candidate;

  if (candidateCmp === rootCmp) {
    return pathBasename(candidate);
  }

  const prefix = `${rootCmp}/`;
  if (candidateCmp.startsWith(prefix)) {
    return candidate.slice(prefix.length);
  }

  return candidate;
}

export function normalizeReferencePathForSession(sessionId, rawPath) {
  const cleaned = normalizedPathForMatch(rawPath);
  if (!cleaned) {
    return "";
  }

  let normalized = cleaned;
  if (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }

  const session = sessions.get(sessionId);
  if (session?.cwd) {
    normalized = toRelativeIfUnder(session.cwd, normalized);
  }

  return normalized;
}

export function extensionForPath(filePath) {
  return String(filePath || "")
    .split(".")
    .pop()
    .toLowerCase();
}

export function languageForPath(filePath) {
  return LANGUAGE_BY_EXTENSION[extensionForPath(filePath)] || "plaintext";
}
