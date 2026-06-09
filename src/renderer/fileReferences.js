import { FILE_REFERENCE_LIMIT, FILE_REFERENCE_PATTERN } from "./constants.js";
import { agenticApp } from "./agenticApp.js";
import { elements } from "./dom.js";
import { sessionFileReferences, sessions, workspaceFilesCache } from "./state.js";
import {
  escapeHtml,
  normalizeCandidateFilePath,
  normalizeReferencePathForSession,
  pathBasename,
  stripAnsi,
} from "./utils.js";

const FILE_REFERENCE_RESOLVE_DEBOUNCE_MS = 75;
const WORKSPACE_FILE_INDEX_TTL_MS = 30000;

const pendingSessionFileReferences = new Map();
const pendingSessionFileResolveTimers = new Map();
const workspaceFileIndexesByRoot = new Map();

function normalizeLookupKey(pathValue) {
  if (!pathValue) {
    return "";
  }

  let normalized = String(pathValue).replace(/\\+/g, "/").trim();
  if (!normalized) {
    return "";
  }

  normalized = normalized.replace(/^\.\//, "");
  if (normalized.startsWith("a/") || normalized.startsWith("b/")) {
    normalized = normalized.slice(2);
  }

  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//")) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function normalizeWorkspaceEntry(entry) {
  if (!entry) {
    return null;
  }

  const relativePath = String(entry.relativePath || "").replace(/\\+/g, "/");
  const absolutePath = String(entry.absolutePath || "").replace(/\\+/g, "/");
  if (!relativePath || !absolutePath) {
    return null;
  }

  return {
    relativePath,
    absolutePath,
    basename: String(entry.basename || pathBasename(relativePath)).trim(),
  };
}

function buildWorkspaceFileIndex(entries) {
  const allEntries = [];
  const byRelative = new Map();
  const byAbsolute = new Map();
  const byBasename = new Map();

  for (const entry of entries) {
    const normalized = normalizeWorkspaceEntry(entry);
    if (!normalized) {
      continue;
    }
    allEntries.push(normalized);

    const relativeKey = normalizeLookupKey(normalized.relativePath);
    const absoluteKey = normalizeLookupKey(normalized.absolutePath);
    if (relativeKey) {
      byRelative.set(relativeKey, normalized);
    }
    if (absoluteKey) {
      byAbsolute.set(absoluteKey, normalized);
    }

    const basenameKey = normalizeLookupKey(normalized.basename);
    if (!basenameKey) {
      continue;
    }

    const group = byBasename.get(basenameKey) || [];
    group.push(normalized);
    byBasename.set(basenameKey, group);
  }

  return {
    allEntries,
    byRelative,
    byAbsolute,
    byBasename,
  };
}

function findUniqueSuffixMatch(index, candidateKey) {
  if (!candidateKey || !candidateKey.includes("/")) {
    return null;
  }

  const suffixes = Array.from(
    new Set([candidateKey, candidateKey.replace(/^\/+/, "")].filter(Boolean)),
  );
  const matches = [];

  for (const entry of index.allEntries) {
    const relativeKey = normalizeLookupKey(entry.relativePath);
    const absoluteKey = normalizeLookupKey(entry.absolutePath);

    const matched = suffixes.some((suffix) => {
      if (relativeKey === suffix || absoluteKey === suffix) {
        return true;
      }

      return (
        relativeKey.endsWith(`/${suffix}`) || absoluteKey.endsWith(`/${suffix}`)
      );
    });

    if (matched) {
      matches.push(entry);
      if (matches.length > 1) {
        return null;
      }
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

async function getWorkspaceFileIndex(sessionId) {
  const session = sessions.get(sessionId);
  const root = String(session?.cwd || "").trim();
  if (!root) {
    return null;
  }

  const existing = workspaceFileIndexesByRoot.get(root);
  const now = Date.now();
  if (existing && now - existing.loadedAt < WORKSPACE_FILE_INDEX_TTL_MS) {
    return existing.index;
  }

  let files = workspaceFilesCache.get(root);
  if (!Array.isArray(files)) {
    const listing = await agenticApp.listWorkspaceFiles({
      sessionId,
      root,
    });
    files = Array.isArray(listing?.files) ? listing.files : [];
    workspaceFilesCache.set(root, files);
  }

  const index = buildWorkspaceFileIndex(files);
  workspaceFileIndexesByRoot.set(root, {
    loadedAt: now,
    index,
  });

  return index;
}

function resolveWorkspaceReference(index, candidatePath) {
  const candidateKey = normalizeLookupKey(candidatePath);
  if (!candidateKey) {
    return null;
  }

  const direct =
    index.byRelative.get(candidateKey) || index.byAbsolute.get(candidateKey);
  if (direct) {
    return direct;
  }

  const suffixMatch = findUniqueSuffixMatch(index, candidateKey);
  if (suffixMatch) {
    return suffixMatch;
  }

  if (candidateKey.includes("/")) {
    return null;
  }

  const basenameMatches = index.byBasename.get(candidateKey) || [];
  if (basenameMatches.length !== 1) {
    return null;
  }

  return basenameMatches[0];
}

function collectFileReferences(rawChunk) {
  const plainText = stripAnsi(rawChunk);
  const refs = [];
  let match;

  while ((match = FILE_REFERENCE_PATTERN.exec(plainText)) !== null) {
    const normalized = normalizeCandidateFilePath(match[1]);
    if (!normalized) {
      continue;
    }

    refs.push({
      filePath: normalized,
      line: match[2] || match[3] ? Number(match[2] || match[3]) : null,
    });
  }

  FILE_REFERENCE_PATTERN.lastIndex = 0;
  return refs;
}

function ensureSessionFileReferences(sessionId) {
  if (!sessionFileReferences.has(sessionId)) {
    sessionFileReferences.set(sessionId, []);
  }

  return sessionFileReferences.get(sessionId);
}

export function ingestFileReferences(sessionId, rawChunk) {
  const found = collectFileReferences(rawChunk);
  if (found.length === 0) {
    return;
  }

  const pending = pendingSessionFileReferences.get(sessionId) || new Map();
  const now = Date.now();

  for (const ref of found) {
    const normalizedPath = normalizeReferencePathForSession(
      sessionId,
      ref.filePath,
    );
    const key = normalizeLookupKey(normalizedPath);
    if (!normalizedPath || !key) {
      continue;
    }

    const existing = pending.get(key);
    pending.set(key, {
      filePath: normalizedPath,
      line: Number.isInteger(ref.line)
        ? ref.line
        : Number.isInteger(existing?.line)
          ? existing.line
          : null,
      updatedAt: now,
    });
  }

  if (pending.size === 0) {
    return;
  }

  pendingSessionFileReferences.set(sessionId, pending);

  if (pendingSessionFileResolveTimers.has(sessionId)) {
    return;
  }

  const timerId = window.setTimeout(() => {
    pendingSessionFileResolveTimers.delete(sessionId);
    void resolveSessionFileReferences(sessionId);
  }, FILE_REFERENCE_RESOLVE_DEBOUNCE_MS);
  pendingSessionFileResolveTimers.set(sessionId, timerId);
}

async function resolveSessionFileReferences(sessionId) {
  const pending = pendingSessionFileReferences.get(sessionId);
  if (!pending || pending.size === 0) {
    return;
  }

  pendingSessionFileReferences.delete(sessionId);

  let index;
  try {
    index = await getWorkspaceFileIndex(sessionId);
  } catch {
    return;
  }

  if (!index) {
    return;
  }

  const existing = ensureSessionFileReferences(sessionId);
  const byPath = new Map(existing.map((entry) => [entry.filePath, entry]));

  for (const candidate of pending.values()) {
    const resolved = resolveWorkspaceReference(index, candidate.filePath);
    if (!resolved) {
      continue;
    }

    const existingEntry = byPath.get(resolved.relativePath);
    byPath.set(resolved.relativePath, {
      filePath: resolved.relativePath,
      line: Number.isInteger(candidate.line)
        ? candidate.line
        : Number.isInteger(existingEntry?.line)
          ? existingEntry.line
          : null,
      updatedAt: Math.max(
        Number(candidate.updatedAt) || 0,
        Number(existingEntry?.updatedAt) || 0,
      ),
    });
  }

  const sorted = Array.from(byPath.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, FILE_REFERENCE_LIMIT);

  sessionFileReferences.set(sessionId, sorted);
}

export function renderSessionFileReferences(sessionId) {
  if (!sessionId) {
    elements.agentFileLinks.classList.add("hidden");
    elements.agentFileLinksList.innerHTML = "";
    return;
  }

  const refs = sessionFileReferences.get(sessionId) || [];
  if (refs.length === 0) {
    elements.agentFileLinks.classList.add("hidden");
    elements.agentFileLinksList.innerHTML = "";
    return;
  }

  const basenameCounts = refs.reduce((counts, ref) => {
    const basename = pathBasename(ref.filePath);
    counts.set(basename, (counts.get(basename) || 0) + 1);
    return counts;
  }, new Map());

  const chips = refs
    .map((ref) => {
      const suffix = Number.isInteger(ref.line) ? `:${ref.line}` : "";
      const basename = pathBasename(ref.filePath);
      const showFullPath = (basenameCounts.get(basename) || 0) > 1;
      const label = showFullPath ? ref.filePath : basename;
      return `
        <button
          type="button"
          class="agent-file-chip"
          data-file-path="${escapeHtml(ref.filePath)}"
          data-file-line="${Number.isInteger(ref.line) ? ref.line : ""}"
          title="Open ${escapeHtml(ref.filePath)}"
        >${escapeHtml(label)}${suffix}</button>
      `;
    })
    .join("");

  elements.agentFileLinksList.innerHTML = chips;
  elements.agentFileLinks.classList.remove("hidden");
}

export function clearSessionFileReferences(sessionId) {
  const timerId = pendingSessionFileResolveTimers.get(sessionId);
  if (timerId) {
    window.clearTimeout(timerId);
    pendingSessionFileResolveTimers.delete(sessionId);
  }

  pendingSessionFileReferences.delete(sessionId);
  sessionFileReferences.delete(sessionId);
}
