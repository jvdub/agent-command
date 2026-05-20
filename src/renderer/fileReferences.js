import { FILE_REFERENCE_LIMIT, FILE_REFERENCE_PATTERN } from "./constants.js";
import { elements } from "./dom.js";
import { sessionFileReferences } from "./state.js";
import {
  escapeHtml,
  normalizeCandidateFilePath,
  normalizeReferencePathForSession,
  pathBasename,
  stripAnsi,
} from "./utils.js";

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
      line: match[2] ? Number(match[2]) : null,
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

  const existing = ensureSessionFileReferences(sessionId);
  const byKey = new Map();

  for (const entry of existing) {
    const normalizedPath = normalizeReferencePathForSession(
      sessionId,
      entry.filePath,
    );
    if (!normalizedPath) {
      continue;
    }

    byKey.set(normalizedPath, {
      ...entry,
      filePath: normalizedPath,
      updatedAt: Number(entry.updatedAt) || Date.now(),
    });
  }

  for (const ref of found) {
    const normalizedPath = normalizeReferencePathForSession(
      sessionId,
      ref.filePath,
    );
    if (!normalizedPath) {
      continue;
    }

    const existingEntry = byKey.get(normalizedPath);
    byKey.set(normalizedPath, {
      filePath: normalizedPath,
      line: Number.isInteger(ref.line)
        ? ref.line
        : Number.isInteger(existingEntry?.line)
          ? existingEntry.line
          : null,
      updatedAt: Date.now(),
    });
  }

  const byBasename = new Map();
  for (const [key, entry] of byKey.entries()) {
    const basename = pathBasename(entry.filePath);
    const group = byBasename.get(basename) || [];
    group.push({ key, entry });
    byBasename.set(basename, group);
  }

  for (const [basename, group] of byBasename.entries()) {
    if (group.length < 2) {
      continue;
    }

    const bareEntries = group.filter(
      ({ entry }) => !entry.filePath.includes("/"),
    );
    const pathEntries = group.filter(({ entry }) =>
      entry.filePath.includes("/"),
    );
    if (bareEntries.length !== 1 || pathEntries.length !== 1) {
      continue;
    }

    const bareKey = bareEntries[0].key;
    const target = pathEntries[0].entry;
    byKey.delete(bareKey);
    byKey.set(pathEntries[0].key, {
      ...target,
      line: Number.isInteger(target.line)
        ? target.line
        : Number.isInteger(bareEntries[0].entry.line)
          ? bareEntries[0].entry.line
          : null,
      updatedAt: Math.max(
        Number(target.updatedAt) || 0,
        Number(bareEntries[0].entry.updatedAt) || 0,
      ),
    });
    byBasename.set(basename, [pathEntries[0]]);
  }

  const sorted = Array.from(byKey.values())
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
  sessionFileReferences.delete(sessionId);
}
