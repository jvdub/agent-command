import { Terminal } from "./vendor/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "./vendor/@xterm/addon-fit/lib/addon-fit.mjs";
import { SearchAddon } from "./vendor/@xterm/addon-search/lib/addon-search.mjs";
import { WebLinksAddon } from "./vendor/@xterm/addon-web-links/lib/addon-web-links.mjs";
import { agenticApp } from "./agenticApp.js";
import {
  bindSessionEvents,
  createSessionLifecycleHandlers,
} from "./sessionLifecycle.js";
import {
  isShortcutKey,
  hasTerminalSelection,
  writeTextToClipboard,
} from "./globalShortcutUtils.js";
import {
  getMonacoKeybindingForAction,
  SHORTCUT_ACTIONS,
  shouldRunShortcut,
} from "./shortcuts.js";
import { createPopoverDismissalController } from "./popoverDismissal.js";
import { FILE_REFERENCE_PATTERN } from "./constants.js";
import {
  createThemeManager,
  getTerminalTheme,
} from "./themeManager.js";
import { renderHtmlIfChanged } from "./renderHtmlIfChanged.js";
import { renderReferencedFileTree } from "./referencedFileTree.js";
import {
  appendBoundedBuffer,
  boundTerminalBuffer,
} from "./boundedBuffer.js";
import { createToastNotifier } from "./toastNotifications.js";
import { createTerminalClipboardController } from "./terminalClipboard.js";

const emptyView = document.querySelector("#empty-view");
const terminalView = document.querySelector("#terminal-view");
const sessionForm = document.querySelector("#session-form");
const newSessionButton = document.querySelector("#new-session-button");
const newSessionPopover = document.querySelector("#new-session-popover");
const openLauncherEmptyButton = document.querySelector("#open-launcher-empty");
const labelInput = document.querySelector("#label");
const commandInput = document.querySelector("#command");
const commandReadiness = document.querySelector("#command-readiness");
const argsInput = document.querySelector("#args");
const cwdInput = document.querySelector("#cwd");
const pickDirectoryButton = document.querySelector("#pick-directory");
const stopSessionButton = document.querySelector("#stop-session");
const sendInterruptButton = document.querySelector("#send-interrupt");
const openFileDrawerButton = document.querySelector("#open-file-drawer");
const manualSendInterruptButton = document.querySelector(
  "#manual-send-interrupt",
);
const addManualTerminalButton = document.querySelector("#add-manual-terminal");
const toggleProcessPanelButton = document.querySelector(
  "#toggle-process-panel",
);
const agentPane = document.querySelector("#agent-pane");
const rightPane = document.querySelector("#right-pane");
const toastRegion = document.querySelector("#toast-region");
const toastNotifier = createToastNotifier({ container: toastRegion });
const sessionTabsList = document.querySelector("#session-tabs-list");
const terminalTitle = document.querySelector("#terminal-title");
const terminalSubtitle = document.querySelector("#terminal-subtitle");
const agentSearchBar = document.querySelector("#agent-search-bar");
const agentSearchInput = document.querySelector("#agent-search-input");
const agentSearchCount = document.querySelector("#agent-search-count");
const agentSearchPrevButton = document.querySelector("#agent-search-prev");
const agentSearchNextButton = document.querySelector("#agent-search-next");
const agentSearchCloseButton = document.querySelector("#agent-search-close");
const agentSearchEnabled = Boolean(
  agentSearchBar &&
  agentSearchInput &&
  agentSearchCount &&
  agentSearchPrevButton &&
  agentSearchNextButton &&
  agentSearchCloseButton,
);
const terminalContainer = document.querySelector("#terminal");
const manualTerminalSubtitle = document.querySelector(
  "#manual-terminal-subtitle",
);
const manualTerminalContainer = document.querySelector("#manual-terminal");
const manualTerminalTabs = document.querySelector("#manual-terminal-tabs");
const modifiedFilesMeta = document.querySelector("#modified-files-meta");
const modifiedFilesList = document.querySelector("#modified-files-list");
const processDetailsPanel = document.querySelector("#process-details-panel");
const processPanelMeta = document.querySelector("#process-panel-meta");
const processDetailsList = document.querySelector("#process-details-list");
const terminalContextMenu = document.querySelector("#terminal-context-menu");
const terminalContextCopyButton = document.querySelector(
  "#terminal-context-copy",
);
const terminalContextPasteButton = document.querySelector(
  "#terminal-context-paste",
);
const terminalContextClearButton = document.querySelector(
  "#terminal-context-clear",
);
const fileDrawer = document.querySelector("#file-drawer");
const agentFileLinks = document.querySelector("#agent-file-links");
const agentFileLinksList = document.querySelector("#agent-file-links-list");
const fileEditorPanel = document.querySelector("#file-editor-panel");
const fileEditorEmpty = document.querySelector("#file-editor-empty");
const fileEditorPath = document.querySelector("#file-editor-path");
const fileEditorStatus = document.querySelector("#file-editor-status");
const fileEditorAutosave = document.querySelector("#file-editor-autosave");
const fileEditorSaveButton = document.querySelector("#file-editor-save");
const fileEditorCloseButton = document.querySelector("#file-editor-close");
const fileEditorSurface = document.querySelector("#file-editor-surface");
const fileEditorPreview = document.querySelector("#file-editor-preview");
const quickOpenOverlay = document.querySelector("#quick-open-overlay");
const quickOpenInput = document.querySelector("#quick-open-input");
const quickOpenMeta = document.querySelector("#quick-open-meta");
const quickOpenResults = document.querySelector("#quick-open-results");
const quickOpenCloseButton = document.querySelector("#quick-open-close");
const themeSelect = document.querySelector("#theme-select");
const copyDiagnosticsButton = document.querySelector("#copy-diagnostics");
const openDataFolderButton = document.querySelector("#open-data-folder");
const clearHistoryButton = document.querySelector("#clear-history");

const IDLE_THRESHOLD_MS = 20000;
const UI_REFRESH_INTERVAL_MS = 150;
const WORKSPACE_CHANGES_REFRESH_INTERVAL_MS = 3000;
const WINDOW_RESIZE_DEBOUNCE_MS = 120;
const FILE_REFERENCE_LIMIT = 24;
const AUTOSAVE_DELAY_MS = 1000;
const ATTENTION_STREAM_MAX_BUFFER = 8192;
const QUICK_OPEN_RECENTS_KEY = "agentic-command-quick-open-recents";
const QUICK_OPEN_RECENTS_LIMIT = 40;
const COPY_SHORTCUT_DEBOUNCE_MS = 50;
const COMMAND_CHECK_DEBOUNCE_MS = 250;
const LANGUAGE_BY_EXTENSION = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  yml: "yaml",
  yaml: "yaml",
  xml: "xml",
  py: "python",
  java: "java",
  go: "go",
  rs: "rust",
  sh: "shell",
  toml: "ini",
};

const PERMISSION_PATTERNS = [
  // Explicit confirmation prompts
  /\bproceed\b.{0,30}\?/i,
  /\bconfirm\b.{0,30}\?/i,
  /\ballow\b.{0,40}\?/i,
  /\bapprove\b.{0,30}\?/i,
  // y/n choice indicators
  /\(y\/n\)|\[y\/n\]|\by\/n\b/i,
  /press\s+y\s+to|type\s+y\s+to/i,
  // Copilot CLI tool-use approval
  /allow\s+this\s+tool/i,
  /allow\s+tool\s+(call|use)/i,
  /run\s+this\s+command/i,
  /execute\s+this\s+command/i,
  /allow\s+(?:bash|shell|file|code)/i,
  /tool\s+(?:call|use)\s*:/i,
  // Claude / other agents
  /shall\s+i\s+proceed/i,
  /would\s+you\s+like\s+me\s+to/i,
  /do\s+you\s+want\s+me\s+to/i,
  /may\s+i\s+(?:run|execute|delete|write|modify)/i,
  // Generic
  /\bgrant\b.{0,20}\?/i,
  /\bdeny\b.{0,20}\?/i,
  /\breject\b.{0,20}\?/i,
];

const QUESTION_PATTERNS = [
  // Lines that end in a question mark (but not y/n prompts which are permission)
  /^(?!.*\by\/n\b).*\?\s*$/m,
  /\bwhat\s+should\b/i,
  /\bhow\s+should\b/i,
  /\bwhich\s+(?:option|approach|file|version|branch)\b/i,
  /\bselect\b.+\boption\b/i,
  /\benter\b.+\bchoice\b/i,
  /\bplease\s+(?:choose|select|pick|specify)\b/i,
];

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /\bfailed\b/i,
  /\bfatal\b/i,
  /\bunhandled\b/i,
];

const BENIGN_ERROR_PHRASES = [
  /\bno\s+errors?\b/i,
  /\bwithout\s+errors?\b/i,
  /\b0\s+errors?\b/i,
  /\berrors?\s*:\s*0\b/i,
  /\bno\s+error\b/i,
  /\bno\s+issues\b/i,
  /\berror\s*:\s*none\b/i,
];

// Each entry is { pattern, label } — the label is shown directly on the card.
// Patterns that match a whole verb/phrase from the CLI output can use
// extractWorkingLabel() instead to pull the raw word.
const WORKING_PATTERNS = [
  { pattern: /\bspelunking\b/i, label: "Spelunking" },
  { pattern: /\bthinking\b/i, label: "Thinking" },
  { pattern: /\bplanning\b/i, label: "Planning" },
  { pattern: /\banalyz(?:e|ing)\b/i, label: "Analyzing" },
  { pattern: /\bsearch(?:ing)?\b/i, label: "Searching" },
  { pattern: /\bgenerating\b/i, label: "Generating" },
  { pattern: /\bgenerat(?:e|ing)\b/i, label: "Generating" },
  { pattern: /\bwriting\b/i, label: "Writing" },
  { pattern: /\bediting\b/i, label: "Editing" },
  { pattern: /\breadings?\b/i, label: "Reading" },
  { pattern: /\breadfile\b/i, label: "Reading" },
  { pattern: /\bread(?:ing)?\s+file/i, label: "Reading file" },
  { pattern: /\brefactor(?:ing)?\b/i, label: "Refactoring" },
  { pattern: /\bdebugging\b/i, label: "Debugging" },
  { pattern: /\btesting\b/i, label: "Testing" },
  { pattern: /\bcompiling\b/i, label: "Compiling" },
  { pattern: /\binstalling\b/i, label: "Installing" },
  { pattern: /\brunning\b.+\bcommand\b/i, label: "Running command" },
  { pattern: /\bexecut(?:e|ing)\b/i, label: "Executing" },
  { pattern: /\bworking\b/i, label: "Working" },
  { pattern: /\bprocessing\b/i, label: "Processing" },
  // Copilot CLI spinner animation: extract the verb after the spinner char
  { pattern: /[●◉◎○]\s+(?:loading|generating|thinking|working)/i, label: null },
];

function extractWorkingLabel(raw) {
  for (const { pattern, label } of WORKING_PATTERNS) {
    if (pattern.test(raw)) {
      if (label !== null) {
        return label;
      }

      // For spinner lines, pull the word after the spinner char
      const spinnerMatch = raw.match(/[●◉◎○]\s+(\S+)/i);
      if (spinnerMatch) {
        const word = spinnerMatch[1].toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      }

      return "Working";
    }
  }

  return null;
}

const READY_PATTERNS = [
  // Generic shell-style prompts on their own line
  /(^|\n)\s*(>|›|➜)\s*$/m,
  /\b(waiting for|ready for) your (input|prompt)\b/i,
  /\benter your prompt\b/i,
  /\btype your message\b/i,
  /\bmessage>\s*$/i,
];

const ERROR_CLEAR_PATTERNS = [
  /\bsuccess\b/i,
  /\bcompleted\b/i,
  /\bfinished\b/i,
  /\bresolved\b/i,
  /\bfixed\b/i,
  /\bno\s+issues\b/i,
  /\bno\s+errors?\b/i,
  /\bchecks?\s+passed\b/i,
  /\bbuild\s+succeeded\b/i,
];

const TERMINAL_OPTIONS = {
  cursorBlink: true,
  fontFamily: "IBM Plex Mono, Cascadia Code, monospace",
  fontSize: 13,
  lineHeight: 1.3,
  minimumContrastRatio: 4.5,
  theme: getTerminalTheme("dark"),
};

const TERMINAL_SEARCH_OPTIONS = {
  incremental: true,
  decorations: {
    matchBackground: "#35526a",
    matchBorder: "#78b8e6",
    matchOverviewRuler: "#78b8e6",
    activeMatchBackground: "#ee6c4d",
    activeMatchBorder: "#f3be7c",
    activeMatchColorOverviewRuler: "#ee6c4d",
  },
};

const sessions = new Map();
const sessionBuffers = new Map();
const sessionInsights = new Map();
const sessionTerminals = new Map();
const manualTerminals = new Map();
const manualTerminalBuffers = new Map();
const manualTerminalTabsBySession = new Map();
const activeManualTerminalBySession = new Map();
const manualTerminalTabsInitializedBySession = new Set();
const sessionProcesses = new Map();
const sessionFileReferences = new Map();
const workspaceChangesRefreshBySession = new Map();
const lastSessionTerminalSize = new Map();
const lastManualTerminalSize = new Map();
const restartingSessionIds = new Set();
const capabilities = {
  processInspectionSupported: true,
};

let activeSessionId = null;
let refreshScheduled = false;
let refreshTimeoutId = null;
let windowResizeTimeoutId = null;
let isProcessPanelOpen = false;
let terminalContextTarget = null;
let monacoEditor = null;
let monacoApi = null;
let monacoLoaderPromise = null;
let editorModel = null;
let openingReferencedFile = false;
let commandCheckTimeoutId = null;
let commandCheckSequence = 0;
let sessionLifecycleHandlers = null;
let lastCopyOrInterruptShortcutAt = 0;
let renamingSessionId = null;
let activeTerminalTheme = getTerminalTheme("dark");

const MONACO_LOADER_PATH = "./vendor/monaco-editor/min/vs/loader.js";
const MONACO_VS_BASE_PATH = "./vendor/monaco-editor/min/vs";
const FILE_REFERENCE_RESOLVE_DEBOUNCE_MS = 75;
const WORKSPACE_FILE_INDEX_TTL_MS = 30000;
const MONACO_LOAD_TIMEOUT_MS = 5000;
let autosaveTimeoutId = null;
let suppressEditorChange = false;
let editorState = {
  open: false,
  sessionId: null,
  filePath: "",
  absolutePath: "",
  relativePath: "",
  dirty: false,
  autosave: false,
};

let isAgentSearchOpen = false;
let quickOpenState = {
  open: false,
  loading: false,
  files: [],
  filtered: [],
  activeIndex: 0,
  recentPaths: [],
};
const pendingSessionFileReferences = new Map();
const pendingSessionFileResolveTimers = new Map();
const workspaceFileIndexBySession = new Map();

function manualTerminalKey(sessionId, terminalId) {
  return `${sessionId}:${terminalId}`;
}

function setProcessInspectionSupport(supported) {
  const isSupported = supported !== false;
  capabilities.processInspectionSupported = isSupported;

  toggleProcessPanelButton.classList.toggle("hidden", !isSupported);
  toggleProcessPanelButton.disabled = !isSupported;

  if (!isSupported) {
    isProcessPanelOpen = false;
    toggleProcessPanelButton.classList.remove("active");
    processDetailsPanel.classList.add("hidden");
    return;
  }

  renderProcessDetails(activeSessionId);
}

function setStatus(label, meta) {
  toastNotifier.notify(label, meta);
}

function setSessionRestartPending(sessionId, pending) {
  if (pending && restartingSessionIds.has(sessionId)) {
    return false;
  }

  if (pending) {
    restartingSessionIds.add(sessionId);
  } else {
    restartingSessionIds.delete(sessionId);
  }

  renderSessionTabs();
  return true;
}

function formatCommand(session) {
  return `${session.command}${session.args.length ? ` ${session.args.join(" ")}` : ""}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadQuickOpenRecents() {
  try {
    const raw = window.localStorage.getItem(QUICK_OPEN_RECENTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, QUICK_OPEN_RECENTS_LIMIT);
  } catch {
    return [];
  }
}

function saveQuickOpenRecents(recents) {
  try {
    window.localStorage.setItem(
      QUICK_OPEN_RECENTS_KEY,
      JSON.stringify(recents.slice(0, QUICK_OPEN_RECENTS_LIMIT)),
    );
  } catch {
    // Ignore localStorage write failures.
  }
}

function touchQuickOpenRecent(relativePath) {
  if (!relativePath) {
    return;
  }

  const normalized = String(relativePath);
  const nextRecents = [
    normalized,
    ...quickOpenState.recentPaths.filter((path) => path !== normalized),
  ].slice(0, QUICK_OPEN_RECENTS_LIMIT);

  quickOpenState.recentPaths = nextRecents;
  saveQuickOpenRecents(nextRecents);
}

function highlightQuickOpenPath(path, query) {
  if (!query) {
    return escapeHtml(path);
  }

  const normalizedQuery = query.toLowerCase();
  const normalizedPath = String(path || "").toLowerCase();
  const start = normalizedPath.indexOf(normalizedQuery);
  if (start < 0) {
    return escapeHtml(path);
  }

  const end = start + normalizedQuery.length;
  return `${escapeHtml(path.slice(0, start))}<mark class="quick-open-match">${escapeHtml(path.slice(start, end))}</mark>${escapeHtml(path.slice(end))}`;
}

function shortId(sessionId) {
  const parts = String(sessionId).split("-");
  return parts[parts.length - 1] || String(sessionId);
}

function compactPath(value) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\\\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getSessionDisplayName(session) {
  if (session.label && session.label.trim()) {
    return session.label.trim();
  }

  const location = compactPath(session.cwd) || "workspace";
  if (session.args.length > 0) {
    return `${location} · ${truncate(session.args.join(" "), 24)}`;
  }

  return location;
}

function getProcessDisplayLabel(processInfo) {
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

function stripAnsi(value) {
  return (
    value
      // CSI sequences: ESC [ <params> <final> — covers ?, !, > prefixes and all param chars
      .replace(/\u001b\[[ -?]*[@-~]/g, "")
      // OSC sequences: ESC ] ... ST or BEL
      .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, "")
      // Simple two-char ESC sequences (ESC + one char)
      .replace(/\u001b./g, "")
      // Remaining bare ESC
      .replace(/\u001b/g, "")
  );
}

function normalizeCandidateFilePath(candidate) {
  if (!candidate) {
    return "";
  }

  return candidate
    .trim()
    .replace(/^['"`[(]+/, "")
    .replace(/[)'"`\],.;:!?]+$/, "");
}

function normalizeFileLookupKey(pathValue) {
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

function basenameForPath(pathValue) {
  const normalized = String(pathValue || "").replace(/\\+/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

function buildWorkspaceFileIndex(entries) {
  const allEntries = [];
  const byRelative = new Map();
  const byAbsolute = new Map();
  const byBasename = new Map();

  for (const entry of entries) {
    const relativePath = String(entry.relativePath || "").replace(/\\+/g, "/");
    const absolutePath = String(entry.absolutePath || "").replace(/\\+/g, "/");
    if (!relativePath || !absolutePath) {
      continue;
    }

    const normalizedEntry = {
      relativePath,
      absolutePath,
      basename: basenameForPath(relativePath),
    };
    allEntries.push(normalizedEntry);

    const relativeKey = normalizeFileLookupKey(relativePath);
    const absoluteKey = normalizeFileLookupKey(absolutePath);
    if (relativeKey) {
      byRelative.set(relativeKey, normalizedEntry);
    }
    if (absoluteKey) {
      byAbsolute.set(absoluteKey, normalizedEntry);
    }

    const basenameKey = normalizeFileLookupKey(normalizedEntry.basename);
    if (!basenameKey) {
      continue;
    }

    const group = byBasename.get(basenameKey) || [];
    group.push(normalizedEntry);
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
    const relativeKey = normalizeFileLookupKey(entry.relativePath);
    const absoluteKey = normalizeFileLookupKey(entry.absolutePath);

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
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  const root = String(session?.cwd || cwdInput.value || "").trim();
  if (!root) {
    return null;
  }

  const existing = workspaceFileIndexBySession.get(sessionId);
  const now = Date.now();
  if (
    existing &&
    existing.root === root &&
    now - existing.loadedAt < WORKSPACE_FILE_INDEX_TTL_MS
  ) {
    return existing.index;
  }

  const listing = await agenticApp.listWorkspaceFiles({
    sessionId,
    root,
  });
  const entries = Array.isArray(listing?.files)
    ? listing.files.map(normalizeWorkspaceFileEntry).filter(Boolean)
    : [];
  const index = buildWorkspaceFileIndex(entries);

  workspaceFileIndexBySession.set(sessionId, {
    root,
    loadedAt: now,
    index,
  });

  return index;
}

function resolveWorkspaceReference(index, rawPath) {
  const cleaned = normalizeCandidateFilePath(rawPath);
  if (!cleaned || cleaned.includes("://")) {
    return null;
  }

  const normalized = cleaned.replace(/\\+/g, "/");
  const candidateKey = normalizeFileLookupKey(normalized);
  if (!candidateKey) {
    return null;
  }

  const directMatch =
    index.byRelative.get(candidateKey) || index.byAbsolute.get(candidateKey);
  if (directMatch) {
    return directMatch;
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

function ingestFileReferences(sessionId, rawChunk) {
  const found = collectFileReferences(rawChunk);
  if (found.length === 0) {
    return;
  }

  const pending = pendingSessionFileReferences.get(sessionId) || new Map();
  const now = Date.now();
  for (const ref of found) {
    const candidatePath = normalizeCandidateFilePath(ref.filePath);
    const key = normalizeFileLookupKey(candidatePath);
    if (!candidatePath || !key) {
      continue;
    }

    const existing = pending.get(key);
    pending.set(key, {
      filePath: candidatePath,
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

    const existingRef = byPath.get(resolved.relativePath);
    byPath.set(resolved.relativePath, {
      filePath: resolved.relativePath,
      line: Number.isInteger(candidate.line)
        ? candidate.line
        : Number.isInteger(existingRef?.line)
          ? existingRef.line
          : null,
      updatedAt: Math.max(
        Number(candidate.updatedAt) || 0,
        Number(existingRef?.updatedAt) || 0,
      ),
    });
  }

  const sorted = Array.from(byPath.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, FILE_REFERENCE_LIMIT);

  sessionFileReferences.set(sessionId, sorted);

  if (activeSessionId === sessionId) {
    renderSessionFileReferences(sessionId);
  }
}

function renderSessionFileReferences(sessionId) {
  if (!sessionId) {
    agentFileLinks.classList.add("hidden");
    renderHtmlIfChanged(agentFileLinksList, "");
    return;
  }

  const refs = sessionFileReferences.get(sessionId) || [];
  if (refs.length === 0) {
    agentFileLinks.classList.add("hidden");
    renderHtmlIfChanged(agentFileLinksList, "");
    return;
  }

  renderHtmlIfChanged(agentFileLinksList, renderReferencedFileTree(refs));
  agentFileLinks.classList.remove("hidden");
}

async function refreshModifiedFiles(sessionId, { force = false } = {}) {
  if (!sessionId || !modifiedFilesList || !modifiedFilesMeta) {
    return;
  }

  const now = Date.now();
  const existing = workspaceChangesRefreshBySession.get(sessionId);
  if (existing?.promise) {
    return existing.promise;
  }

  if (
    !force &&
    existing?.completedAt &&
    now - existing.completedAt < WORKSPACE_CHANGES_REFRESH_INTERVAL_MS
  ) {
    return;
  }

  const promise = (async () => {
    try {
      const result = await agenticApp.listWorkspaceChanges(sessionId);
      if (activeSessionId !== sessionId) {
        return;
      }

      const files = Array.isArray(result?.files) ? result.files : [];
      modifiedFilesMeta.textContent =
        result?.supported === false
          ? "Unavailable"
          : `${files.length} ${files.length === 1 ? "change" : "changes"}`;
      renderHtmlIfChanged(
        modifiedFilesList,
        files.length === 0
          ? '<p class="status-meta">No modified files.</p>'
          : files
              .map(
                ({ status, filePath }) => `
                <button
                  type="button"
                  class="modified-file-button"
                  data-file-path="${escapeHtml(filePath)}"
                  title="Open ${escapeHtml(filePath)}"
                >
                  <span class="modified-file-status">${escapeHtml(status)}</span>
                  <span class="modified-file-path">${escapeHtml(filePath)}</span>
                </button>
              `,
              )
              .join(""),
      );
    } catch {
      if (activeSessionId === sessionId) {
        modifiedFilesMeta.textContent = "Unavailable";
        renderHtmlIfChanged(
          modifiedFilesList,
          '<p class="status-meta">Unable to read workspace changes.</p>',
        );
      }
    } finally {
      const current = workspaceChangesRefreshBySession.get(sessionId);
      if (current?.promise === promise) {
        workspaceChangesRefreshBySession.set(sessionId, {
          promise: null,
          completedAt: Date.now(),
        });
      }
    }
  })();

  workspaceChangesRefreshBySession.set(sessionId, {
    promise,
    completedAt: existing?.completedAt || 0,
  });

  return promise;
}

function extensionForPath(filePath) {
  const ext = String(filePath || "")
    .split(".")
    .pop()
    .toLowerCase();
  return ext;
}

function languageForPath(filePath) {
  return LANGUAGE_BY_EXTENSION[extensionForPath(filePath)] || "plaintext";
}

function setEditorStatus(message) {
  fileEditorStatus.textContent = message;
}

function setEditorDirtyState(isDirty) {
  editorState.dirty = Boolean(isDirty);
  if (editorState.dirty) {
    setEditorStatus("Unsaved changes");
  }
}

function showFilePreview(content) {
  fileEditorPreview.textContent = String(content || "");
  fileEditorPreview.classList.remove("hidden");
  fileEditorSaveButton.disabled = true;
}

function hideFilePreview() {
  fileEditorPreview.classList.add("hidden");
  fileEditorSaveButton.disabled = false;
}

function waitForMonacoEditor() {
  return Promise.race([
    ensureMonacoEditor(),
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Workspace editor timed out while loading."));
      }, MONACO_LOAD_TIMEOUT_MS);
    }),
  ]);
}

function openFileDrawer() {
  fileDrawer.classList.remove("hidden");

  // Warm Monaco in the background so the first file click opens faster.
  ensureMonacoEditor().catch((error) => {
    console.warn("Unable to preload the workspace editor.", error);
  });
}

function closeFileEditorModal(force = false) {
  if (!editorState.open) {
    fileEditorPanel.classList.add("hidden");
    fileEditorEmpty.classList.remove("hidden");
    fileDrawer.classList.add("hidden");
    return true;
  }

  if (editorState.dirty && !force) {
    const shouldDiscard = window.confirm(
      "Discard unsaved changes in the file editor?",
    );
    if (!shouldDiscard) {
      return false;
    }
  }

  fileEditorPanel.classList.add("hidden");
  fileEditorEmpty.classList.remove("hidden");
  fileDrawer.classList.add("hidden");
  hideFilePreview();
  editorState.open = false;

  if (autosaveTimeoutId) {
    window.clearTimeout(autosaveTimeoutId);
    autosaveTimeoutId = null;
  }

  const agent = getActiveTerminalInstance();
  agent?.terminal.focus();

  return true;
}

function uniqueStrings(values) {
  return Array.from(
    new Set(values.filter(Boolean).map((value) => String(value))),
  );
}

function monacoLoaderCandidates() {
  const absolute = new URL(MONACO_LOADER_PATH, window.location.href).toString();
  return uniqueStrings([absolute, MONACO_LOADER_PATH]);
}

function monacoVsBaseCandidates() {
  const absolute = new URL(`${MONACO_VS_BASE_PATH}/`, window.location.href)
    .toString()
    .replace(/\/$/, "");
  return uniqueStrings([absolute, MONACO_VS_BASE_PATH]);
}

function loadMonacoWithVsPath(amdRequire, vsPath) {
  return new Promise((resolve, reject) => {
    amdRequire.config({
      paths: {
        vs: vsPath,
      },
    });

    amdRequire(
      ["vs/editor/editor.main"],
      () => {
        if (!window.monaco?.editor) {
          reject(new Error("Monaco editor API did not initialize."));
          return;
        }

        resolve(window.monaco);
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function ensureMonacoEditor() {
  if (monacoEditor && monacoApi) {
    return Promise.resolve(monacoApi);
  }

  if (monacoLoaderPromise) {
    return monacoLoaderPromise;
  }

  monacoLoaderPromise = new Promise((resolve, reject) => {
    const initializeMonaco = async () => {
      const amdRequire = window.require || window.requirejs;
      if (!amdRequire) {
        reject(new Error("Monaco loader is unavailable."));
        return;
      }

      let resolvedApi = null;
      let lastError = null;

      for (const vsPath of monacoVsBaseCandidates()) {
        try {
          resolvedApi = await loadMonacoWithVsPath(amdRequire, vsPath);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!resolvedApi) {
        const detail =
          lastError && String(lastError.message || lastError).trim()
            ? ` ${String(lastError.message || lastError).trim()}`
            : "";
        reject(new Error(`Monaco loader is unavailable.${detail}`));
        return;
      }

      monacoApi = resolvedApi;
      monacoEditor = monacoApi.editor.create(fileEditorSurface, {
        value: "",
        language: "plaintext",
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 13,
        theme:
          document.documentElement.dataset.theme === "light"
            ? "vs"
            : "vs-dark",
      });

      // Ensure quick-open works when Monaco has keyboard focus.
      const monacoQuickOpenShortcut = getMonacoKeybindingForAction(
        SHORTCUT_ACTIONS.QUICK_OPEN,
        monacoApi,
      );
      if (monacoQuickOpenShortcut !== null) {
        monacoEditor.addCommand(monacoQuickOpenShortcut, () => {
          openVsCodeQuickOpen();
        });
      }

      monacoEditor.onDidChangeModelContent(() => {
        if (suppressEditorChange || !editorState.open) {
          return;
        }

        setEditorDirtyState(true);

        if (!editorState.autosave) {
          return;
        }

        if (autosaveTimeoutId) {
          window.clearTimeout(autosaveTimeoutId);
        }

        autosaveTimeoutId = window.setTimeout(() => {
          autosaveTimeoutId = null;
          saveOpenEditorFile("Auto-saved");
        }, AUTOSAVE_DELAY_MS);
      });

      resolve(monacoApi);
    };

    if (window.require || window.requirejs) {
      initializeMonaco();
      return;
    }

    const existingLoader = document.querySelector(
      'script[data-monaco-loader="1"]',
    );
    if (existingLoader) {
      // If a script was found but already finished loading, try init immediately.
      if (existingLoader.readyState === "complete") {
        initializeMonaco();
        return;
      }

      existingLoader.addEventListener("load", initializeMonaco, { once: true });
      existingLoader.addEventListener(
        "error",
        () => reject(new Error("Monaco loader is unavailable.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("data-monaco-loader", "1");
    const [firstLoaderPath, ...fallbackLoaderPaths] = monacoLoaderCandidates();
    script.src = firstLoaderPath;
    script.onload = initializeMonaco;
    script.onerror = () => {
      // Retry with an absolute file URL fallback for Windows file:// edge cases.
      if (fallbackLoaderPaths.length > 0) {
        script.src = fallbackLoaderPaths[0];
        return;
      }

      reject(new Error("Monaco loader is unavailable."));
    };
    document.head.appendChild(script);
  });

  return monacoLoaderPromise.catch((error) => {
    // Allow a future open attempt to retry loading if initialization failed.
    monacoLoaderPromise = null;
    throw error;
  });
}

async function saveOpenEditorFile(successLabel = "Saved") {
  if (!editorState.open || !editorState.sessionId || !editorState.filePath) {
    return;
  }

  if (!monacoEditor) {
    return;
  }

  try {
    fileEditorSaveButton.disabled = true;
    const content = monacoEditor.getValue();
    await agenticApp.saveWorkspaceFile(
      editorState.sessionId,
      editorState.filePath,
      content,
    );
    editorState.dirty = false;
    setEditorStatus(`${successLabel} ${editorState.relativePath}`);
    setStatus("Saved", editorState.relativePath);
  } catch (error) {
    setEditorStatus(error.message || "Unable to save file");
    setStatus("Error", error.message || "Unable to save file");
  } finally {
    fileEditorSaveButton.disabled = false;
  }
}

function applyOpenEditorFileChange(file) {
  if (
    !editorState.open ||
    file?.sessionId !== editorState.sessionId ||
    file?.absolutePath !== editorState.absolutePath
  ) {
    return;
  }

  if (file.deleted) {
    setEditorStatus(`File removed: ${editorState.relativePath}`);
    return;
  }

  if (typeof file.content !== "string") {
    return;
  }

  if (!editorModel) {
    showFilePreview(file.content);
    setEditorStatus(`Reloaded ${editorState.relativePath}`);
    return;
  }

  if (editorModel.getValue() === file.content) {
    return;
  }

  suppressEditorChange = true;
  try {
    editorModel.setValue(file.content);
    editorState.dirty = false;
    setEditorStatus(`Reloaded ${editorState.relativePath}`);
  } finally {
    suppressEditorChange = false;
  }
}

async function openReferencedFile(sessionId, filePath, lineNumber = null) {
  openingReferencedFile = true;
  let openStage = "reading the workspace file";

  try {
    setEditorStatus(`Opening ${filePath}...`);
    fileEditorPath.textContent = filePath;
    fileDrawer.classList.remove("hidden");
    fileEditorPanel.classList.remove("hidden");
    fileEditorEmpty.classList.add("hidden");
    const file = await agenticApp.openWorkspaceFile(sessionId, filePath);
    showFilePreview(file.content);
    fileEditorPath.textContent = file.relativePath;
    editorState.open = true;
    editorState.sessionId = sessionId;
    editorState.filePath = filePath;
    editorState.absolutePath = file.absolutePath;
    editorState.relativePath = file.relativePath;
    editorState.dirty = false;
    setEditorStatus(`Opened ${file.relativePath}`);

    openStage = "loading the workspace editor";
    await waitForMonacoEditor();

    openStage = "creating the editor model";
    suppressEditorChange = true;

    if (editorModel) {
      editorModel.dispose();
      editorModel = null;
    }

    const language = languageForPath(file.relativePath);
    const safeRelativePath = file.relativePath.replace(/\\/g, "/");
    const uri = monacoApi.Uri.parse(`inmemory://workspace/${safeRelativePath}`);
    editorModel = monacoApi.editor.createModel(file.content, language, uri);
    monacoEditor.setModel(editorModel);
    monacoEditor.setScrollTop(0);
    hideFilePreview();

    if (Number.isInteger(lineNumber) && lineNumber > 0) {
      monacoEditor.revealLineInCenter(lineNumber);
      monacoEditor.setPosition({ lineNumber, column: 1 });
    }

    fileEditorPath.textContent = file.relativePath;
    fileDrawer.classList.remove("hidden");
    fileEditorPanel.classList.remove("hidden");
    fileEditorEmpty.classList.add("hidden");
    editorState.open = true;
    editorState.sessionId = sessionId;
    editorState.filePath = filePath;
    editorState.absolutePath = file.absolutePath;
    editorState.relativePath = file.relativePath;
    editorState.dirty = false;

    setEditorStatus(`Opened ${file.relativePath}`);
    monacoEditor.focus();
  } catch (error) {
    const detail = error?.message || String(error || "Unknown error");
    const message = `Unable to open ${filePath} while ${openStage}: ${detail}`;
    console.error(message, {
      error,
      filePath,
      lineNumber,
      openStage,
      sessionId,
    });
    if (editorState.open && editorState.sessionId === sessionId) {
      setEditorStatus(
        `Opened ${editorState.relativePath} in preview; ${detail}`,
      );
      return;
    }

    fileEditorPath.textContent = filePath;
    fileDrawer.classList.remove("hidden");
    fileEditorPanel.classList.remove("hidden");
    fileEditorEmpty.classList.add("hidden");
    setEditorStatus(message);
    setStatus("Error", message);
  } finally {
    suppressEditorChange = false;
    openingReferencedFile = false;
  }
}

function normalizeWorkspaceFileEntry(entry) {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    const normalized = entry.replace(/\\+/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return {
      absolutePath: normalized,
      relativePath: normalized,
      basename: parts[parts.length - 1] || normalized,
    };
  }

  const relativePath = String(entry.relativePath || entry.path || "").replace(
    /\\+/g,
    "/",
  );
  if (!relativePath) {
    return null;
  }

  return {
    absolutePath: String(entry.absolutePath || relativePath).replace(
      /\\+/g,
      "/",
    ),
    relativePath,
    basename: entry.basename || relativePath.split("/").pop() || relativePath,
  };
}

function scoreWorkspaceFileMatch(fileEntry, normalizedQuery) {
  const rel = fileEntry.relativePath.toLowerCase();
  const base = fileEntry.basename.toLowerCase();

  if (base === normalizedQuery) {
    return 0;
  }

  if (base.startsWith(normalizedQuery)) {
    return 1;
  }

  if (rel.startsWith(normalizedQuery)) {
    return 2;
  }

  if (base.includes(normalizedQuery)) {
    return 3;
  }

  if (rel.includes(normalizedQuery)) {
    return 4;
  }

  return Number.POSITIVE_INFINITY;
}

async function openQuickFilePicker() {
  if (
    !quickOpenOverlay ||
    !quickOpenInput ||
    !quickOpenMeta ||
    !quickOpenResults
  ) {
    setStatus("Find File", "Quick-open UI unavailable");
    return;
  }

  if (!activeSessionId) {
    setStatus("Find File", "Open a session before searching files");
    return;
  }

  if (quickOpenState.open) {
    quickOpenInput.focus();
    quickOpenInput.select();
    return;
  }

  quickOpenState.open = true;
  quickOpenState.loading = true;
  quickOpenState.files = [];
  quickOpenState.filtered = [];
  quickOpenState.activeIndex = 0;
  quickOpenOverlay.classList.remove("hidden");
  quickOpenInput.value = "";
  quickOpenMeta.textContent = "Loading workspace files...";
  quickOpenResults.innerHTML =
    '<div class="quick-open-empty">Loading workspace files...</div>';
  quickOpenInput.focus();
  quickOpenInput.select();

  let listing;
  try {
    listing = await agenticApp.listWorkspaceFiles({
      sessionId: activeSessionId,
    });
  } catch (error) {
    quickOpenState.loading = false;
    quickOpenMeta.textContent =
      error.message || "Unable to list workspace files";
    quickOpenResults.innerHTML =
      '<div class="quick-open-empty">Unable to load workspace files.</div>';
    setStatus("Error", error.message || "Unable to list workspace files");
    return;
  }

  quickOpenState.loading = false;
  quickOpenState.files = Array.isArray(listing?.files)
    ? listing.files.map(normalizeWorkspaceFileEntry).filter(Boolean)
    : [];

  renderQuickOpenResults();
}

function closeQuickOpen({ restoreFocus = true } = {}) {
  if (!quickOpenState.open) {
    return;
  }

  quickOpenState.open = false;
  quickOpenOverlay.classList.add("hidden");

  if (restoreFocus) {
    if (editorState.open) {
      monacoEditor?.focus();
      return;
    }

    getActiveTerminalInstance()?.terminal.focus();
  }
}

function renderQuickOpenResults() {
  if (!quickOpenState.open) {
    return;
  }

  const query = quickOpenInput.value.trim().toLowerCase();
  const files = quickOpenState.files;
  const recentIndexByPath = new Map(
    quickOpenState.recentPaths.map((path, index) => [path, index]),
  );

  if (quickOpenState.loading) {
    quickOpenMeta.textContent = "Loading workspace files...";
    quickOpenResults.innerHTML =
      '<div class="quick-open-empty">Loading workspace files...</div>';
    return;
  }

  if (files.length === 0) {
    quickOpenMeta.textContent = "No workspace files found";
    quickOpenResults.innerHTML =
      '<div class="quick-open-empty">No workspace files found.</div>';
    return;
  }

  const ranked = files
    .map((entry) => ({
      entry,
      score: query ? scoreWorkspaceFileMatch(entry, query) : 2,
      recentRank: recentIndexByPath.get(entry.relativePath),
    }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const leftRecent =
        typeof left.recentRank === "number"
          ? left.recentRank
          : Number.POSITIVE_INFINITY;
      const rightRecent =
        typeof right.recentRank === "number"
          ? right.recentRank
          : Number.POSITIVE_INFINITY;
      if (leftRecent !== rightRecent) {
        return leftRecent - rightRecent;
      }

      if (left.entry.relativePath.length !== right.entry.relativePath.length) {
        return left.entry.relativePath.length - right.entry.relativePath.length;
      }

      return left.entry.relativePath.localeCompare(right.entry.relativePath);
    })
    .slice(0, 200)
    .map(({ entry }) => entry);

  quickOpenState.filtered = ranked;
  quickOpenState.activeIndex = Math.max(
    0,
    Math.min(quickOpenState.activeIndex, ranked.length - 1),
  );

  if (ranked.length === 0) {
    quickOpenMeta.textContent = query
      ? `No matches for "${quickOpenInput.value.trim()}"`
      : "Type to search workspace files";
    quickOpenResults.innerHTML =
      '<div class="quick-open-empty">No matching files.</div>';
    return;
  }

  quickOpenMeta.textContent = `${quickOpenState.activeIndex + 1} of ${ranked.length}`;
  quickOpenResults.innerHTML = ranked
    .map((entry, index) => {
      const isActive = index === quickOpenState.activeIndex;
      const recentRank = recentIndexByPath.get(entry.relativePath);
      const recentPrefix =
        typeof recentRank === "number"
          ? '<span class="quick-open-recent">Recent</span>'
          : "";
      return `
        <button
          type="button"
          class="quick-open-result${isActive ? " active" : ""}"
          data-index="${index}"
          title="${escapeHtml(entry.relativePath)}"
        >
          <span class="quick-open-result-path">${recentPrefix}${highlightQuickOpenPath(entry.relativePath, query)}</span>
        </button>
      `;
    })
    .join("");

  const activeButton = quickOpenResults.querySelector(
    ".quick-open-result.active",
  );
  if (activeButton) {
    activeButton.scrollIntoView({ block: "nearest" });
  }
}

function moveQuickOpenSelection(direction) {
  if (!quickOpenState.filtered.length) {
    return;
  }

  const delta = direction === "up" ? -1 : 1;
  const length = quickOpenState.filtered.length;
  quickOpenState.activeIndex =
    (quickOpenState.activeIndex + delta + length) % length;
  renderQuickOpenResults();
}

async function openQuickOpenSelection(index = quickOpenState.activeIndex) {
  const result = quickOpenState.filtered[index];
  if (!result || !activeSessionId) {
    return;
  }

  closeQuickOpen({ restoreFocus: false });
  const openPath = result.absolutePath || result.relativePath;
  await openReferencedFile(activeSessionId, openPath);
  touchQuickOpenRecent(result.relativePath);
  openFileDrawer();
  setStatus("Opened", result.relativePath);
}

async function openVsCodeQuickOpen() {
  await openQuickFilePicker();
  return false;
}

async function copyEditorSelection() {
  if (!editorState.open || !monacoEditor) {
    return false;
  }

  const model = monacoEditor.getModel();
  const selection = monacoEditor.getSelection();
  if (
    !model ||
    !selection ||
    (typeof selection.isEmpty === "function" && selection.isEmpty())
  ) {
    return false;
  }

  const text = model.getValueInRange(selection);
  if (!text) {
    return false;
  }

  await writeTextToClipboard(text, (value) =>
    agenticApp.writeClipboardText(value),
  );

  setStatus("Copied", editorState.relativePath || "Selection copied");
  return true;
}

function getFocusedEditableSelectionText() {
  const focused = document.activeElement;
  if (!focused) {
    return "";
  }

  if (focused instanceof HTMLTextAreaElement) {
    const start = focused.selectionStart;
    const end = focused.selectionEnd;
    if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
      return focused.value.slice(start, end);
    }
    return "";
  }

  if (focused instanceof HTMLInputElement) {
    const disallowedTypes = new Set([
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ]);
    if (disallowedTypes.has(String(focused.type || "").toLowerCase())) {
      return "";
    }

    const start = focused.selectionStart;
    const end = focused.selectionEnd;
    if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
      return focused.value.slice(start, end);
    }
    return "";
  }

  if (focused.isContentEditable) {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) {
      return "";
    }

    const text = String(selection);
    if (!text) {
      return "";
    }

    const range = selection.getRangeAt(0);
    const startInside = focused.contains(range.startContainer);
    const endInside = focused.contains(range.endContainer);
    return startInside || endInside ? text : "";
  }

  return "";
}

async function runCopyOrInterruptShortcut() {
  if (await copyEditorSelection()) {
    return true;
  }

  const focusedSelection = getFocusedEditableSelectionText();
  if (focusedSelection) {
    await writeTextToClipboard(focusedSelection, (value) =>
      agenticApp.writeClipboardText(value),
    );
    setStatus("Copied", "Selection copied");
    return true;
  }

  const target = getShortcutTerminalTarget();
  if (!target) {
    return false;
  }

  const copied = await terminalClipboard.copyTargetSelection(target);
  if (copied) {
    return true;
  }

  if (target.kind === "manual") {
    await sendManualInterrupt(target.terminalId || "1");
    return true;
  }

  await sendInterrupt();
  return true;
}

function triggerCopyOrInterruptShortcut() {
  const now = Date.now();
  if (now - lastCopyOrInterruptShortcutAt < COPY_SHORTCUT_DEBOUNCE_MS) {
    return;
  }

  lastCopyOrInterruptShortcutAt = now;
  runCopyOrInterruptShortcut().catch((error) => {
    setStatus("Error", error?.message || "Unable to process Ctrl+C shortcut");
  });
}

function getTerminalShortcutCandidates() {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (target) => {
    if (!target?.terminal || !target?.mount) {
      return;
    }

    const key = `${target.kind || "agent"}:${target.sessionId || ""}:${target.terminalId || ""}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push(target);
  };

  addCandidate(terminalContextTarget);
  addCandidate(getActiveTerminalInstance());
  addCandidate(getManualTerminalInstance(activeSessionId, "1"));
  addCandidate(getManualTerminalInstance(activeSessionId, "2"));

  for (const instance of sessionTerminals.values()) {
    addCandidate(instance);
  }

  for (const instance of manualTerminals.values()) {
    addCandidate(instance);
  }

  return candidates;
}

function getSelectionOwnerTerminalTarget(candidates) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  return (
    candidates.find((target) => {
      const mount = target.mount;
      return (
        mount &&
        (mount.contains(range.startContainer) ||
          mount.contains(range.endContainer))
      );
    }) || null
  );
}

function getFocusedTerminalTarget(candidates) {
  const focused = document.activeElement;
  if (!focused) {
    return null;
  }

  return (
    candidates.find(
      (target) => target.mount && target.mount.contains(focused),
    ) || null
  );
}

function getShortcutTerminalTarget() {
  const candidates = getTerminalShortcutCandidates();
  if (!candidates.length) {
    return null;
  }

  const selectionOwner = getSelectionOwnerTerminalTarget(candidates);
  if (
    selectionOwner &&
    hasTerminalSelection(selectionOwner.terminal, selectionOwner.mount)
  ) {
    return selectionOwner;
  }

  const focused = getFocusedTerminalTarget(candidates);
  if (focused && hasTerminalSelection(focused.terminal, focused.mount)) {
    return focused;
  }

  const selected = candidates.find((target) =>
    hasTerminalSelection(target.terminal, target.mount),
  );
  if (selected) {
    return selected;
  }

  return focused || selectionOwner || candidates[0] || null;
}

function ensureSessionBuffer(sessionId) {
  if (!sessionBuffers.has(sessionId)) {
    sessionBuffers.set(sessionId, "");
  }
}

function appendSessionBuffer(sessionId, chunk) {
  ensureSessionBuffer(sessionId);
  sessionBuffers.set(
    sessionId,
    appendBoundedBuffer(sessionBuffers.get(sessionId), chunk),
  );
}

function ensureSessionInsight(sessionId) {
  if (!sessionInsights.has(sessionId)) {
    sessionInsights.set(sessionId, {
      lastActivityAt: null,
      lastInputAt: null,
      lastWorkingAt: null,
      lastReadyAt: null,
      workingDetail: null,
      awaitingPermission: false,
      permissionDetail: "",
      awaitingQuestion: false,
      questionDetail: "",
      hasError: false,
      errorMessage: "",
      lastErrorAt: null,
      streamCarry: "",
    });
  }

  const insight = sessionInsights.get(sessionId);
  if (typeof insight.streamCarry !== "string") {
    insight.streamCarry = "";
  }

  return insight;
}

function markSessionInput(sessionId) {
  const insight = ensureSessionInsight(sessionId);
  insight.lastActivityAt = Date.now();
  insight.lastInputAt = Date.now();
  insight.lastReadyAt = null;
  insight.awaitingPermission = false;
  insight.awaitingQuestion = false;
  // User interaction usually indicates recovery/forward progress, so clear stale error state.
  insight.hasError = false;
  insight.errorMessage = "";
  insight.lastErrorAt = null;
  insight.streamCarry = "";
}

function extractAttentionSnippet(rawData) {
  const lines = stripAnsi(rawData)
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    lines.find(
      (l) =>
        // Must have enough printable content
        l.length > 4 &&
        // Reject lines that are purely box-drawing / spinner chars
        !/^[─━═╌╍┄┅┆┇╴╸╹╺╻╼╽╾╿│┃┌┐└┘├┤┬┴┼╭╮╯╰■□●○◉◎\-=|/\\]+$/.test(l) &&
        // Reject lines that still contain control/non-printable characters
        !/[\x00-\x1f\x7f]/.test(l),
    ) || ""
  ).slice(0, 72);
}

function updateInsightFromOutput(sessionId, data) {
  const insight = ensureSessionInsight(sessionId);
  insight.lastActivityAt = Date.now();

  const normalizedChunk = stripAnsi(String(data || ""));
  const combined = `${insight.streamCarry || ""}${normalizedChunk}`.slice(
    -ATTENTION_STREAM_MAX_BUFFER,
  );
  const lines = combined.split(/\r?\n/);
  const trailingFragment = lines.pop() || "";
  insight.streamCarry = trailingFragment.slice(-ATTENTION_STREAM_MAX_BUFFER);

  const segments = lines
    .map((line) => ({ raw: line, normalized: line.toLowerCase() }))
    .concat(
      trailingFragment.trim()
        ? [
            {
              raw: trailingFragment,
              normalized: trailingFragment.toLowerCase(),
            },
          ]
        : [],
    );

  for (const segment of segments) {
    const snippet = extractAttentionSnippet(segment.raw);

    if (
      PERMISSION_PATTERNS.some((pattern) => pattern.test(segment.normalized))
    ) {
      insight.awaitingPermission = true;
      insight.awaitingQuestion = false;
      insight.permissionDetail = snippet;
    } else if (
      QUESTION_PATTERNS.some((pattern) => pattern.test(segment.normalized))
    ) {
      insight.awaitingQuestion = true;
      insight.awaitingPermission = false;
      insight.questionDetail = snippet;
    }

    const containsError = ERROR_PATTERNS.some((pattern) =>
      pattern.test(segment.normalized),
    );
    const looksBenign = BENIGN_ERROR_PHRASES.some((pattern) =>
      pattern.test(segment.normalized),
    );

    if (containsError && !looksBenign) {
      insight.hasError = true;
      insight.lastErrorAt = Date.now();
      insight.errorMessage = segment.raw.trim().slice(0, 80);
    }

    const workingLabel = extractWorkingLabel(segment.normalized);
    const matchedReady = READY_PATTERNS.some((pattern) =>
      pattern.test(segment.normalized),
    );
    const matchedErrorClear = ERROR_CLEAR_PATTERNS.some((pattern) =>
      pattern.test(segment.normalized),
    );

    if (workingLabel) {
      insight.lastWorkingAt = Date.now();
      insight.workingDetail = workingLabel;
      insight.lastReadyAt = null;
      insight.hasError = false;
      insight.errorMessage = "";
      insight.lastErrorAt = null;
      // Clear question/permission flags when agent is actively working
      insight.awaitingQuestion = false;
      insight.awaitingPermission = false;
    } else if (matchedReady) {
      insight.lastReadyAt = Date.now();
      insight.hasError = false;
      insight.errorMessage = "";
      insight.lastErrorAt = null;
      // Clear question/permission flags when agent becomes ready
      insight.awaitingQuestion = false;
      insight.awaitingPermission = false;
    } else if (matchedErrorClear) {
      insight.hasError = false;
      insight.errorMessage = "";
      insight.lastErrorAt = null;
      // Clear question/permission flags on error clear
      insight.awaitingQuestion = false;
      insight.awaitingPermission = false;
    }
  }
}

function resetSessionInsight(sessionId) {
  sessionInsights.set(sessionId, {
    lastActivityAt: null,
    lastInputAt: null,
    lastWorkingAt: null,
    lastReadyAt: null,
    workingDetail: null,
    awaitingPermission: false,
    permissionDetail: "",
    awaitingQuestion: false,
    questionDetail: "",
    hasError: false,
    errorMessage: "",
    lastErrorAt: null,
    streamCarry: "",
  });
}

function rehydrateInsightFromBuffer(session) {
  const buffer = sessionBuffers.get(session.id) || "";
  resetSessionInsight(session.id);

  if (!buffer) {
    return;
  }

  // Replay recent output to recover the latest attention/status state after refresh.
  const tail = buffer.slice(-12000);
  updateInsightFromOutput(session.id, tail);
}

function deriveAttentionStatus(session) {
  if (!session.isRunning) {
    if (typeof session.exitCode === "number" && session.exitCode !== 0) {
      return {
        label: "Exited With Error",
        className: "error",
        detail: `Exit code ${session.exitCode}`,
      };
    }

    return {
      label: "Stopped",
      className: "ended",
      detail: "Not running",
    };
  }

  const insight = ensureSessionInsight(session.id);

  if (!insight.lastActivityAt) {
    return {
      label: "Idle",
      className: "idle",
      detail: "Waiting for output or input",
    };
  }

  const hasRecentError =
    insight.hasError &&
    insight.lastErrorAt &&
    Date.now() - insight.lastErrorAt < IDLE_THRESHOLD_MS;

  if (hasRecentError) {
    return {
      label: "Error",
      className: "error",
      detail: insight.errorMessage || "Check terminal output",
    };
  }

  if (insight.awaitingPermission) {
    return {
      label: "Needs Permission",
      className: "permission",
      detail: insight.permissionDetail || "Awaiting your approval",
    };
  }

  if (insight.awaitingQuestion) {
    return {
      label: "Needs Answer",
      className: "question",
      detail: insight.questionDetail || "Agent is waiting for your response",
    };
  }

  const now = Date.now();
  const hasRecentActivity = now - insight.lastActivityAt < IDLE_THRESHOLD_MS;
  const hasRecentWorking =
    insight.lastWorkingAt && now - insight.lastWorkingAt < IDLE_THRESHOLD_MS;
  const hasRecentReady =
    insight.lastReadyAt && now - insight.lastReadyAt < IDLE_THRESHOLD_MS;
  const readyAfterWorking =
    insight.lastReadyAt &&
    (!insight.lastWorkingAt || insight.lastReadyAt >= insight.lastWorkingAt);

  if (hasRecentWorking) {
    return {
      label: "Active",
      className: "running",
      detail: insight.workingDetail || "Working",
    };
  }

  if (hasRecentReady && readyAfterWorking) {
    return {
      label: "Idle",
      className: "idle",
      detail: insight.lastInputAt
        ? "Ready for your next prompt"
        : "Waiting for your first prompt",
    };
  }

  if (hasRecentActivity) {
    return {
      label: "Active",
      className: "running",
      detail: "Receiving output",
    };
  }

  if (now - insight.lastActivityAt >= IDLE_THRESHOLD_MS) {
    return {
      label: "Idle",
      className: "idle",
      detail: "No output activity recently",
    };
  }

  return {
    label: "Idle",
    className: "idle",
    detail: insight.lastInputAt
      ? "Waiting after your last input"
      : "Waiting for your first prompt",
  };
}

function clearTerminalViewport(terminal) {
  terminal.clear();
}

function closeTerminalContextMenu() {
  terminalContextMenu.classList.add("hidden");
  terminalContextTarget = null;
}

function setAgentSearchMessage(message, isError = false) {
  if (!agentSearchEnabled) {
    return;
  }

  agentSearchCount.textContent = message;
  agentSearchCount.classList.toggle("error", isError);
}

function getActiveAgentSearchAddon() {
  return getActiveTerminalInstance()?.searchAddon || null;
}

function updateAgentSearchControls() {
  if (!agentSearchEnabled) {
    return;
  }

  const hasActiveTerminal = Boolean(getActiveTerminalInstance());
  const hasTerm = Boolean(agentSearchInput.value.trim());

  agentSearchInput.disabled = !hasActiveTerminal;
  agentSearchPrevButton.disabled = !hasActiveTerminal || !hasTerm;
  agentSearchNextButton.disabled = !hasActiveTerminal || !hasTerm;

  if (!hasActiveTerminal) {
    setAgentSearchMessage("No active session", true);
    return;
  }

  if (!hasTerm) {
    setAgentSearchMessage("Type to search");
  }
}

function clearAgentSearch() {
  if (!agentSearchEnabled) {
    return;
  }

  const searchAddon = getActiveAgentSearchAddon();
  if (searchAddon) {
    searchAddon.clearDecorations();
  }

  agentSearchInput.value = "";
  updateAgentSearchControls();
}

function closeAgentSearch({ restoreFocus = true, clear = true } = {}) {
  if (!agentSearchEnabled) {
    isAgentSearchOpen = false;
    return;
  }

  isAgentSearchOpen = false;
  agentSearchBar.classList.add("hidden");

  if (clear) {
    clearAgentSearch();
  }

  if (restoreFocus) {
    getActiveTerminalInstance()?.terminal.focus();
  }
}

function openAgentSearch({ selectText = true } = {}) {
  if (!agentSearchEnabled) {
    setStatus("Find", "Search UI unavailable in this layout");
    return;
  }

  if (!getActiveTerminalInstance()) {
    setStatus("Find", "Open a session before searching");
    return;
  }

  isAgentSearchOpen = true;
  agentSearchBar.classList.remove("hidden");
  updateAgentSearchControls();

  if (selectText && agentSearchInput.value) {
    agentSearchInput.select();
    return;
  }

  agentSearchInput.focus();
}

function runAgentSearch(direction = "next", options = {}) {
  if (!agentSearchEnabled) {
    return false;
  }

  const searchAddon = getActiveAgentSearchAddon();
  const term = agentSearchInput.value.trim();

  if (!searchAddon) {
    updateAgentSearchControls();
    return false;
  }

  if (!term) {
    searchAddon.clearDecorations();
    updateAgentSearchControls();
    return false;
  }

  const searchOptions = {
    ...TERMINAL_SEARCH_OPTIONS,
    incremental: options.incremental === true,
  };

  const matched =
    direction === "previous"
      ? searchAddon.findPrevious(term, searchOptions)
      : searchAddon.findNext(term, searchOptions);

  if (!matched) {
    setAgentSearchMessage("No matches", true);
  }

  updateAgentSearchControls();
  return matched;
}

function openTerminalContextMenu(event, target) {
  event.preventDefault();
  terminalContextTarget = target;

  // Keep copy enabled even if selection detection briefly desyncs on right-click.
  terminalContextCopyButton.disabled = !target;

  const menuWidth = 152;
  const menuHeight = 132;
  const left = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
  const top = Math.min(event.clientY, window.innerHeight - menuHeight - 12);

  terminalContextMenu.style.left = `${Math.max(12, left)}px`;
  terminalContextMenu.style.top = `${Math.max(12, top)}px`;
  terminalContextMenu.classList.remove("hidden");

  // Some platforms briefly desync xterm selection state during right-click.
  window.requestAnimationFrame(() => {
    if (terminalContextTarget !== target) {
      return;
    }

    terminalContextCopyButton.disabled = !target;
  });
}

const terminalClipboard = createTerminalClipboardController({
  readClipboardText: () => agenticApp.readClipboardText(),
  writeClipboardText: (value) => agenticApp.writeClipboardText(value),
  setStatus,
  openContextMenu: openTerminalContextMenu,
  sendInterrupt: (target) => {
    if (target.kind === "manual") {
      return sendManualInterrupt(target.terminalId || "1");
    }

    return sendInterrupt();
  },
});

function attachTerminalClipboardHandlers(target) {
  terminalClipboard.attachToTarget(target, {
    onKeyDown(event) {
      if (shouldRunShortcut(SHORTCUT_ACTIONS.QUICK_OPEN, event)) {
        event.preventDefault();
        openVsCodeQuickOpen();
        return false;
      }

      return true;
    },
  });
}

async function sendTerminalClearCommand(target) {
  if (!target?.sessionId) {
    return;
  }

  if (target.kind === "manual") {
    await agenticApp.writeToManualTerminal(target.sessionId, "clear\r");
    return;
  }

  markSessionInput(target.sessionId);
  scheduleUiRefresh();
  await agenticApp.writeToSession(target.sessionId, "/clear\r");
}

function createWebLinksAddon(instance) {
  return new WebLinksAddon((event, uri) => {
    event?.preventDefault?.();

    Promise.resolve(agenticApp.openExternalUrl(uri))
      .then(() => {
        setStatus("Opened", uri);
      })
      .catch((error) => {
        const detail = error?.message || "Unable to open link";
        setStatus("Error", detail);
      });

    if (instance.kind === "agent") {
      markSessionInput(instance.sessionId);
      scheduleUiRefresh();
    }
  });
}

function createFileLinkProvider(sessionId, terminal) {
  return {
    provideLinks(y, callback) {
      const line = terminal.buffer.active.getLine(y - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      const matcher = new RegExp(FILE_REFERENCE_PATTERN.source, "g");
      const matches = [];
      let match;

      while ((match = matcher.exec(text)) !== null) {
        const rawPath = normalizeCandidateFilePath(match[1]);
        if (!rawPath || rawPath.includes("://")) {
          continue;
        }

        const lineNumber =
          match[2] || match[3] ? Number(match[2] || match[3]) : null;
        const startColumn = match.index + 1;
        const endColumn = match.index + match[0].length;
        if (endColumn < startColumn) {
          continue;
        }

        matches.push({
          rawPath,
          lineNumber,
          startColumn,
          endColumn,
        });
      }

      if (matches.length === 0) {
        callback(undefined);
        return;
      }

      getWorkspaceFileIndex(sessionId)
        .then((index) => {
          if (!index) {
            callback(undefined);
            return;
          }

          const links = [];
          for (const candidate of matches) {
            const resolved = resolveWorkspaceReference(
              index,
              candidate.rawPath,
            );
            if (!resolved) {
              continue;
            }

            links.push({
              text: candidate.rawPath,
              range: {
                start: { x: candidate.startColumn, y },
                end: { x: candidate.endColumn, y },
              },
              activate: () =>
                openReferencedFile(
                  sessionId,
                  resolved.relativePath,
                  candidate.lineNumber,
                ),
              hover: () => setStatus("Open File", resolved.relativePath),
            });
          }

          callback(links.length ? links : undefined);
        })
        .catch(() => {
          callback(undefined);
        });
    },
  };
}

function createSessionTerminal(sessionId) {
  if (sessionTerminals.has(sessionId)) {
    return sessionTerminals.get(sessionId);
  }

  const mount = document.createElement("div");
  mount.className = "terminal-instance hidden";
  mount.dataset.sessionId = sessionId;
  terminalContainer.append(mount);

  const terminal = new Terminal({
    ...TERMINAL_OPTIONS,
    theme: activeTerminalTheme,
  });
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon({ highlightLimit: 2000 });
  const webLinksAddon = createWebLinksAddon({
    sessionId,
    kind: "agent",
  });
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.open(mount);
  terminal.registerLinkProvider(createFileLinkProvider(sessionId, terminal));
  const instance = {
    terminal,
    fitAddon,
    searchAddon,
    mount,
    sessionId,
    kind: "agent",
  };
  attachTerminalClipboardHandlers(instance);

  searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
    if (activeSessionId !== sessionId || !isAgentSearchOpen) {
      return;
    }

    if (!agentSearchInput.value.trim()) {
      setAgentSearchMessage("Type to search");
      return;
    }

    if (resultCount === 0) {
      setAgentSearchMessage("No matches", true);
      return;
    }

    if (resultIndex >= 0) {
      setAgentSearchMessage(`${resultIndex + 1} of ${resultCount}`);
      return;
    }

    setAgentSearchMessage(`${resultCount} matches`);
  });

  terminal.onData((data) => {
    if (activeSessionId !== sessionId) {
      return;
    }

    markSessionInput(sessionId);
    scheduleUiRefresh();
    agenticApp.writeToSession(sessionId, data);
  });

  sessionTerminals.set(sessionId, instance);

  const buffer = sessionBuffers.get(sessionId);
  if (buffer) {
    terminal.write(buffer);
  }

  return instance;
}

function showSessionTerminal(sessionId, { focusTerminal = true } = {}) {
  for (const [id, instance] of sessionTerminals.entries()) {
    instance.mount.classList.toggle("hidden", id !== sessionId);
  }

  const instance = createSessionTerminal(sessionId);
  instance.mount.classList.remove("hidden");
  instance.fitAddon.fit();
  if (focusTerminal) {
    instance.terminal.focus();
  }
  return instance;
}

function getActiveTerminalInstance() {
  if (!activeSessionId) {
    return null;
  }

  return sessionTerminals.get(activeSessionId) || null;
}

function updateManualTerminalSubtitle(session) {
  if (!session) {
    manualTerminalSubtitle.textContent = "";
    return;
  }

  const tabs = manualTerminalTabsBySession.get(session.id) || [];
  manualTerminalSubtitle.textContent = tabs.length
    ? `${session.cwd} - Interactive shell`
    : `${session.cwd} - No workspace terminals open`;
}

function ensureManualTerminalTabs(sessionId, { seedDefault = false } = {}) {
  if (!manualTerminalTabsBySession.has(sessionId)) {
    manualTerminalTabsBySession.set(sessionId, ["1"]);
  }

  if (
    seedDefault &&
    !manualTerminalTabsInitializedBySession.has(sessionId)
  ) {
    const tabs = manualTerminalTabsBySession.get(sessionId);
    if (tabs.length === 0) {
      tabs.push("1");
    }
  }

  manualTerminalTabsInitializedBySession.add(sessionId);

  const tabs = manualTerminalTabsBySession.get(sessionId);
  if (!activeManualTerminalBySession.has(sessionId) && tabs.length > 0) {
    activeManualTerminalBySession.set(sessionId, "1");
  }

  return tabs;
}

function getActiveManualTerminalId(sessionId = activeSessionId) {
  if (!sessionId) {
    return null;
  }
  const tabs = ensureManualTerminalTabs(sessionId);
  const activeId = activeManualTerminalBySession.get(sessionId);
  if (activeId && tabs.includes(activeId)) {
    return activeId;
  }

  const fallbackId = tabs[0] || null;
  if (fallbackId) {
    activeManualTerminalBySession.set(sessionId, fallbackId);
  } else {
    activeManualTerminalBySession.delete(sessionId);
  }

  return fallbackId;
}

function renderManualTerminalTabs(sessionId) {
  if (!sessionId) {
    renderHtmlIfChanged(manualTerminalTabs, "");
    return;
  }

  const activeId = getActiveManualTerminalId(sessionId);
  const tabs = ensureManualTerminalTabs(sessionId);
  if (tabs.length === 0) {
    renderHtmlIfChanged(
      manualTerminalTabs,
      '<p class="status-meta manual-terminal-empty-tabs">No terminals</p>',
    );
    return;
  }

  renderHtmlIfChanged(
    manualTerminalTabs,
    tabs
      .map(
        (terminalId) => `
        <span class="manual-terminal-tab-shell">
          <button
            type="button"
            class="manual-terminal-tab ${terminalId === activeId ? "active" : ""}"
            data-terminal-id="${escapeHtml(terminalId)}"
            role="tab"
            aria-selected="${terminalId === activeId}"
          >Terminal ${escapeHtml(terminalId)}</button>
          <button
            type="button"
            class="manual-terminal-close"
            data-terminal-id="${escapeHtml(terminalId)}"
            aria-label="Close Terminal ${escapeHtml(terminalId)}"
            title="Close terminal"
          >×</button>
        </span>
      `,
      )
      .join(""),
  );
}

function hideManualTerminalAreaMessage(message) {
  let emptyMessage = manualTerminalContainer.querySelector(
    ".manual-terminal-empty",
  );
  if (!emptyMessage) {
    emptyMessage = document.createElement("div");
    emptyMessage.className = "manual-terminal-empty hidden";
    manualTerminalContainer.append(emptyMessage);
  }

  emptyMessage.textContent = message;
  emptyMessage.classList.add("hidden");
  return emptyMessage;
}

function showManualTerminalAreaMessage(message) {
  const emptyMessage = hideManualTerminalAreaMessage(message);
  emptyMessage.classList.remove("hidden");
}

async function addManualTerminal() {
  if (!activeSessionId) {
    return;
  }

  const tabs = ensureManualTerminalTabs(activeSessionId);
  const nextId = String(
    Math.max(0, ...tabs.map((terminalId) => Number(terminalId) || 0)) + 1,
  );
  tabs.push(nextId);
  activeManualTerminalBySession.set(activeSessionId, nextId);
  renderManualTerminalTabs(activeSessionId);
  await showManualTerminal(activeSessionId, nextId);
  await resizeManualTerminal(nextId);
  getManualTerminalInstance(activeSessionId, nextId)?.terminal.focus();
}

async function closeManualTerminal(sessionId, terminalId) {
  if (!sessionId || !terminalId) {
    return;
  }

  const tabs = ensureManualTerminalTabs(sessionId);
  const tabIndex = tabs.indexOf(terminalId);
  if (tabIndex === -1) {
    return;
  }

  tabs.splice(tabIndex, 1);
  const key = manualTerminalKey(sessionId, terminalId);
  const instance = manualTerminals.get(key);
  if (instance) {
    instance.terminal.dispose();
    instance.mount.remove();
    manualTerminals.delete(key);
  }
  manualTerminalBuffers.delete(key);

  try {
    await agenticApp.closeManualTerminal(sessionId, terminalId);
  } catch (error) {
    setStatus("Error", error?.message || "Unable to close terminal");
  }

  if (tabs.length === 0) {
    activeManualTerminalBySession.delete(sessionId);
    if (sessionId === activeSessionId) {
      renderManualTerminalTabs(sessionId);
      updateManualTerminalSubtitle(sessions.get(sessionId));
      showManualTerminalAreaMessage("No workspace terminals open");
    }
    setStatus("Closed", "Terminal closed");
    return;
  }

  if (activeManualTerminalBySession.get(sessionId) === terminalId) {
    activeManualTerminalBySession.set(
      sessionId,
      tabs[Math.max(0, tabIndex - 1)] || tabs[0],
    );
  }

  if (sessionId === activeSessionId) {
    const nextActiveId = getActiveManualTerminalId(sessionId);
    renderManualTerminalTabs(sessionId);
    updateManualTerminalSubtitle(sessions.get(sessionId));
    await showManualTerminal(sessionId, nextActiveId);
    await resizeManualTerminal(nextActiveId);
    getManualTerminalInstance(sessionId, nextActiveId)?.terminal.focus();
  }
  setStatus("Closed", "Terminal closed");
}

function createManualTerminal(sessionId, terminalId) {
  const key = manualTerminalKey(sessionId, terminalId);
  if (manualTerminals.has(key)) {
    return manualTerminals.get(key);
  }

  const mount = document.createElement("div");
  mount.className = "terminal-instance hidden";
  mount.dataset.sessionId = sessionId;
  mount.dataset.terminalId = terminalId;
  manualTerminalContainer.append(mount);

  const terminal = new Terminal({
    ...TERMINAL_OPTIONS,
    theme: activeTerminalTheme,
  });
  const fitAddon = new FitAddon();
  const webLinksAddon = createWebLinksAddon({
    sessionId,
    kind: "manual",
  });
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.open(mount);
  terminal.registerLinkProvider(createFileLinkProvider(sessionId, terminal));
  const instance = {
    terminal,
    fitAddon,
    mount,
    sessionId,
    terminalId,
    kind: "manual",
    initialized: false,
  };
  attachTerminalClipboardHandlers(instance);

  terminal.onData((data) => {
    if (activeSessionId !== sessionId) {
      return;
    }

    agenticApp.writeToManualTerminal(sessionId, data, terminalId);
  });

  manualTerminals.set(key, instance);
  return instance;
}

async function ensureManualTerminal(sessionId, terminalId) {
  const key = manualTerminalKey(sessionId, terminalId);
  const instance = createManualTerminal(sessionId, terminalId);
  if (instance.initialized) {
    return instance;
  }

  const result = await agenticApp.ensureManualTerminal(sessionId, terminalId);
  const buffered = manualTerminalBuffers.get(key) || result.outputBuffer || "";

  if (buffered) {
    instance.terminal.write(buffered);
  }

  manualTerminalBuffers.set(key, buffered);
  instance.initialized = true;
  return instance;
}

async function showManualTerminal(
  sessionId,
  terminalId,
  { focusTerminal = true } = {},
) {
  if (!terminalId) {
    for (const instance of manualTerminals.values()) {
      if (instance.sessionId === sessionId) {
        instance.mount.classList.add("hidden");
      }
    }
    showManualTerminalAreaMessage("No workspace terminals open");
    return null;
  }

  hideManualTerminalAreaMessage("");
  for (const instance of manualTerminals.values()) {
    const isVisible =
      instance.sessionId === sessionId && instance.terminalId === terminalId;
    instance.mount.classList.toggle("hidden", !isVisible);
  }

  const instance = await ensureManualTerminal(sessionId, terminalId);
  instance.mount.classList.remove("hidden");
  instance.fitAddon.fit();
  if (focusTerminal) {
    instance.terminal.focus();
  }
  return instance;
}

function getManualTerminalInstance(sessionId, terminalId) {
  if (!sessionId) {
    return null;
  }

  return manualTerminals.get(manualTerminalKey(sessionId, terminalId)) || null;
}

function refreshVisibleUi() {
  renderSessionTabs();

  if (!activeSessionId) {
    showEmptyView(false);
    return;
  }

  const active = sessions.get(activeSessionId);
  if (!active) {
    return;
  }

  renderTerminalHeader(active);
  updateManualTerminalSubtitle(active);
  renderManualTerminalTabs(active.id);
  setTerminalActionsEnabled(active);
  renderProcessDetails(active.id);
  renderSessionFileReferences(active.id);
}

function scheduleUiRefresh() {
  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;
  refreshTimeoutId = window.setTimeout(() => {
    refreshScheduled = false;
    refreshTimeoutId = null;
    refreshVisibleUi();
  }, UI_REFRESH_INTERVAL_MS);
}

function setTerminalActionsEnabled(session) {
  const enabled = Boolean(session?.isRunning);
  stopSessionButton.disabled = !enabled;
  sendInterruptButton.disabled = !enabled;
}

function getSessionStatusLabel(session) {
  if (session.isRunning) {
    return "Running";
  }

  if (typeof session.exitCode === "number") {
    return `Exited (${session.exitCode})`;
  }

  return "Stopped";
}

function renderSessionTabs() {
  if (
    renamingSessionId &&
    sessionTabsList.querySelector(
      `.session-rename-input[data-session-id="${CSS.escape(renamingSessionId)}"]`,
    )
  ) {
    return;
  }

  const allSessions = Array.from(sessions.values()).sort(
    (left, right) => right.createdAt - left.createdAt,
  );

  if (allSessions.length === 0) {
    renderHtmlIfChanged(
      sessionTabsList,
      '<p class="status-meta">No sessions</p>',
    );
    return;
  }

  const tabs = allSessions
    .map((session) => {
      const attention = deriveAttentionStatus(session);
      const procs = sessionProcesses.get(session.id) || [];
      const isActive = activeSessionId === session.id;
      const primaryProc = procs[0] ? getProcessDisplayLabel(procs[0]) : "";
      const procSummary =
        procs.length > 0
          ? `${escapeHtml(primaryProc)}${procs.length > 1 ? ` +${procs.length - 1}` : ""}`
          : "";
      const displayName = getSessionDisplayName(session);
      const isRenaming = renamingSessionId === session.id;
      const tabContents = `
        <div class="session-tab-top">
          ${
            isRenaming
              ? `<input type="text" class="session-rename-input" data-session-id="${session.id}" value="${escapeHtml(session.label || "")}" placeholder="${escapeHtml(displayName)}" maxlength="120" aria-label="Session name">`
              : `<p class="session-tab-name">${escapeHtml(displayName)}</p>`
          }
          <p class="session-tab-id">#${shortId(session.id)}</p>
        </div>
        <p class="session-tab-attention">${attention.label}</p>
        ${procSummary ? `<p class="session-tab-proc">Process: ${procSummary}</p>` : ""}
      `;
      const sessionTab = isRenaming
        ? `<div class="session-tab session-tab-renaming ${isActive ? "active" : ""} ${attention.className}" data-session-id="${session.id}">${tabContents}</div>`
        : `<button type="button" class="session-tab ${!session.isRunning ? "stopped-tab " : ""}${isActive ? "active" : ""} ${attention.className}" data-session-id="${session.id}">${tabContents}</button>`;
      const renameAction = isRenaming
        ? ""
        : `<button type="button" class="session-action-rename" data-session-id="${session.id}" title="Rename session" aria-label="Rename ${escapeHtml(displayName)}">&#9998;</button>`;

      if (!session.isRunning) {
        const isRestarting = restartingSessionIds.has(session.id);
        return `
          <div class="session-tab-shell stopped">
            <div class="session-tab-group ${isActive ? "active" : ""} ${isRestarting ? "pending" : ""}">
              ${sessionTab}
              <div class="session-tab-actions">
                <button type="button" class="session-action-restart ${isRestarting ? "pending" : ""}" data-session-id="${session.id}" title="${isRestarting ? "Restarting session" : "Restart session"}" ${isRestarting ? 'disabled aria-busy="true"' : ""}>${isRestarting ? "Restarting..." : "Restart"}</button>
                <button type="button" class="session-action-remove" data-session-id="${session.id}" title="Remove session" ${isRestarting ? "disabled" : ""}>Remove</button>
              </div>
            </div>
            ${renameAction}
          </div>
        `;
      }

      return `
        <div class="session-tab-shell">
          ${sessionTab}
          ${renameAction}
        </div>
      `;
    })
    .join("");

  renderHtmlIfChanged(sessionTabsList, tabs);
}

function beginSessionRename(sessionId) {
  if (!sessions.has(sessionId)) {
    return;
  }

  renamingSessionId = sessionId;
  renderSessionTabs();
  window.requestAnimationFrame(() => {
    const input = sessionTabsList.querySelector(
      `.session-rename-input[data-session-id="${CSS.escape(sessionId)}"]`,
    );
    input?.focus();
    input?.select();
  });
}

function cancelSessionRename(sessionId) {
  if (renamingSessionId !== sessionId) {
    return;
  }

  renamingSessionId = null;
  renderSessionTabs();
  sessionTabsList
    .querySelector(`.session-tab[data-session-id="${CSS.escape(sessionId)}"]`)
    ?.focus();
}

async function saveSessionRename(input) {
  const sessionId = input?.dataset.sessionId;
  if (
    !sessionId ||
    renamingSessionId !== sessionId ||
    input.dataset.saving === "true"
  ) {
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    renamingSessionId = null;
    renderSessionTabs();
    return;
  }

  const label = input.value.trim();
  if (label === String(session.label || "").trim()) {
    cancelSessionRename(sessionId);
    return;
  }

  input.dataset.saving = "true";
  input.disabled = true;
  try {
    const updated = await agenticApp.renameSession(sessionId, label);
    sessions.set(sessionId, { ...session, ...updated });
    renamingSessionId = null;
    renderSessionTabs();
    if (activeSessionId === sessionId) {
      renderTerminalHeader(sessions.get(sessionId));
    }
    setStatus(
      "Renamed",
      label ? `Session renamed to ${label}` : "Custom session name removed",
    );
  } catch (error) {
    input.dataset.saving = "false";
    input.disabled = false;
    input.focus();
    setStatus("Error", error.message || "Unable to rename session");
  }
}

function showEmptyView(shouldRefresh = true) {
  emptyView.classList.remove("hidden");
  terminalView.classList.add("hidden");
  processDetailsPanel.classList.add("hidden");
  closeAgentSearch({ restoreFocus: false });

  for (const instance of sessionTerminals.values()) {
    instance.mount.classList.add("hidden");
  }

  for (const instance of manualTerminals.values()) {
    instance.mount.classList.add("hidden");
  }

  activeSessionId = null;
  renderSessionFileReferences(null);
  renderManualTerminalTabs(null);
  modifiedFilesMeta.textContent = "";
  renderHtmlIfChanged(
    modifiedFilesList,
    '<p class="status-meta">No modified files.</p>',
  );
  closeFileEditorModal(true);
  if (shouldRefresh) {
    refreshVisibleUi();
  }
}

function renderTerminalHeader(session) {
  terminalTitle.textContent = getSessionDisplayName(session);
  terminalSubtitle.textContent = `${session.cwd} - ${getSessionStatusLabel(session)}`;
}

function renderProcessDetails(sessionId) {
  if (!capabilities.processInspectionSupported) {
    processDetailsPanel.classList.add("hidden");
    return;
  }

  if (!isProcessPanelOpen || !sessionId) {
    processDetailsPanel.classList.add("hidden");
    return;
  }

  processDetailsPanel.classList.remove("hidden");
  const processes = sessionProcesses.get(sessionId) || [];
  processPanelMeta.textContent = `${processes.length} running`;

  if (processes.length === 0) {
    processDetailsList.innerHTML =
      '<p class="status-meta">No non-default spawned processes detected.</p>';
    return;
  }

  processDetailsList.innerHTML = processes
    .map((proc) => {
      const label = getProcessDisplayLabel(proc);
      const command = proc.cmdline || proc.comm || "";
      return `
        <article class="process-row">
          <div class="process-row-top">
            <p class="process-name">${escapeHtml(label)}</p>
            <p class="process-meta">PID ${proc.pid} · ${escapeHtml(proc.state)} · depth ${proc.depth ?? 0}</p>
          </div>
          <p class="process-command">${escapeHtml(command)}</p>
        </article>
      `;
    })
    .join("");
}

async function openTerminalView(
  sessionId,
  { forceResize = false } = {},
) {
  if (editorState.open && activeSessionId && activeSessionId !== sessionId) {
    const closed = closeFileEditorModal();
    if (!closed) {
      return;
    }
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  if (activeSessionId && activeSessionId !== sessionId && isAgentSearchOpen) {
    closeAgentSearch({ restoreFocus: false });
  }

  activeSessionId = sessionId;
  newSessionPopover.classList.add("hidden");
  emptyView.classList.add("hidden");
  terminalView.classList.remove("hidden");
  renderSessionTabs();
  renderTerminalHeader(session);
  updateManualTerminalSubtitle(session);
  ensureManualTerminalTabs(sessionId, { seedDefault: true });
  renderManualTerminalTabs(sessionId);
  setTerminalActionsEnabled(session);
  renderProcessDetails(sessionId);
  const agentTerminal = showSessionTerminal(sessionId, {
    focusTerminal: false,
  });
  agentTerminal.terminal.focus();

  await resizeSession({ force: forceResize });
  const activeManualTerminalId = getActiveManualTerminalId(sessionId);
  if (activeManualTerminalId) {
    await showManualTerminal(sessionId, activeManualTerminalId, {
      focusTerminal: false,
    });
    await resizeManualTerminal(activeManualTerminalId);
  } else {
    await showManualTerminal(sessionId, null, {
      focusTerminal: false,
    });
  }
  await refreshModifiedFiles(sessionId, { force: true });
}

function updateSessions(payload) {
  const incomingIds = new Set(payload.map((session) => session.id));

  for (const existingId of sessions.keys()) {
    if (!incomingIds.has(existingId)) {
      if (renamingSessionId === existingId) {
        renamingSessionId = null;
      }
      sessionProcesses.delete(existingId);
      sessionInsights.delete(existingId);
      sessionBuffers.delete(existingId);
      sessionFileReferences.delete(existingId);
      workspaceChangesRefreshBySession.delete(existingId);
      lastSessionTerminalSize.delete(existingId);
      pendingSessionFileReferences.delete(existingId);
      workspaceFileIndexBySession.delete(existingId);
      manualTerminalTabsBySession.delete(existingId);
      manualTerminalTabsInitializedBySession.delete(existingId);
      activeManualTerminalBySession.delete(existingId);
      restartingSessionIds.delete(existingId);
      const pendingTimer = pendingSessionFileResolveTimers.get(existingId);
      if (pendingTimer) {
        window.clearTimeout(pendingTimer);
        pendingSessionFileResolveTimers.delete(existingId);
      }
      for (const key of Array.from(manualTerminalBuffers.keys())) {
        if (key.startsWith(`${existingId}:`)) {
          manualTerminalBuffers.delete(key);
          lastManualTerminalSize.delete(key);
        }
      }
      for (const [key, instance] of manualTerminals.entries()) {
        if (!key.startsWith(`${existingId}:`)) {
          continue;
        }

        instance.mount.remove();
        manualTerminals.delete(key);
      }
    }
  }

  sessions.clear();
  for (const session of payload) {
    sessions.set(session.id, session);
    const priorBuffer = sessionBuffers.get(session.id) || "";
    const incomingBuffer =
      typeof session.outputBuffer === "string" ? session.outputBuffer : null;
    sessionBuffers.set(
      session.id,
      boundTerminalBuffer(
        incomingBuffer !== null ? incomingBuffer : priorBuffer,
      ),
    );
    rehydrateInsightFromBuffer(session);
  }

  if (activeSessionId && !sessions.has(activeSessionId)) {
    closeFileEditorModal(true);
    showEmptyView(false);
  }

  refreshVisibleUi();

  // Do not wait for interval after refresh; populate process badges immediately.
  pollSessionProcesses();
}

function bindGlobalEvents() {
  bindSessionEvents({
    updateInsightFromOutput,
    appendSessionBuffer,
    ingestFileReferences,
    sessionTerminals,
    getActiveSessionId: () => activeSessionId,
    scheduleUiRefresh,
    ensureSessionInsight,
    manualTerminalKey,
    manualTerminalBuffers,
    manualTerminals,
    updateSessions,
    setStatus,
  });
}

async function resizeSession({ force = false } = {}) {
  const instance = getActiveTerminalInstance();
  if (!activeSessionId || !instance) {
    return;
  }

  instance.fitAddon.fit();
  const size = {
    cols: instance.terminal.cols,
    rows: instance.terminal.rows,
  };
  const sizeKey = `${size.cols}x${size.rows}`;
  if (!force && lastSessionTerminalSize.get(activeSessionId) === sizeKey) {
    return;
  }

  lastSessionTerminalSize.set(activeSessionId, sizeKey);
  try {
    await agenticApp.resizeSession(activeSessionId, size);
  } catch (error) {
    if (lastSessionTerminalSize.get(activeSessionId) === sizeKey) {
      lastSessionTerminalSize.delete(activeSessionId);
    }
    throw error;
  }
}

async function resizeManualTerminal(terminalId) {
  const instance = getManualTerminalInstance(activeSessionId, terminalId);
  if (!activeSessionId || !instance) {
    return;
  }

  instance.fitAddon.fit();
  const size = {
    cols: instance.terminal.cols,
    rows: instance.terminal.rows,
  };
  const terminalKey = manualTerminalKey(activeSessionId, terminalId);
  const sizeKey = `${size.cols}x${size.rows}`;
  if (lastManualTerminalSize.get(terminalKey) === sizeKey) {
    return;
  }

  lastManualTerminalSize.set(terminalKey, sizeKey);
  try {
    await agenticApp.resizeManualTerminal(
      activeSessionId,
      size,
      terminalId,
    );
  } catch (error) {
    if (lastManualTerminalSize.get(terminalKey) === sizeKey) {
      lastManualTerminalSize.delete(terminalKey);
    }
    throw error;
  }
}

async function resizeManualTerminals() {
  const terminalId = getActiveManualTerminalId();
  if (terminalId) {
    await resizeManualTerminal(terminalId);
  }
}

async function initializeContext() {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.initializeContext();

  const context = await agenticApp.getContext();
  const contextDefaultCommand =
    typeof context.defaultCommand === "string"
      ? context.defaultCommand.trim()
      : "";
  const currentCommand = (commandInput.value || "").trim();
  if (
    contextDefaultCommand &&
    (!currentCommand || currentCommand === "claude")
  ) {
    commandInput.value = contextDefaultCommand;
  }

  if (context.supportedPlatform === false) {
    setStatus(
      "Unsupported platform",
      "Agentic Command v1 is tested and supported on Windows and Linux",
    );
  }

  await refreshCommandReadiness();
}

async function refreshCommandReadiness() {
  const command = commandInput.value.trim();
  const sequence = ++commandCheckSequence;

  if (!command) {
    commandReadiness.textContent = "Enter the agent CLI executable to run.";
    commandReadiness.className = "field-help warning";
    return;
  }

  commandReadiness.textContent = `Checking ${command}...`;
  commandReadiness.className = "field-help";

  try {
    const result = await agenticApp.checkCommand(command);
    if (sequence !== commandCheckSequence) {
      return;
    }

    if (result.available) {
      commandReadiness.textContent = `${command} is available.`;
      commandReadiness.className = "field-help ready";
      return;
    }

    commandReadiness.textContent = `${command} was not found in PATH. Install it or choose another command.`;
    commandReadiness.className = "field-help warning";
  } catch {
    if (sequence === commandCheckSequence) {
      commandReadiness.textContent = "Command availability could not be checked.";
      commandReadiness.className = "field-help warning";
    }
  }
}

function scheduleCommandReadinessCheck() {
  if (commandCheckTimeoutId) {
    window.clearTimeout(commandCheckTimeoutId);
  }
  commandCheckTimeoutId = window.setTimeout(() => {
    commandCheckTimeoutId = null;
    void refreshCommandReadiness();
  }, COMMAND_CHECK_DEBOUNCE_MS);
}

async function copyDiagnostics() {
  try {
    const diagnostics = await agenticApp.getDiagnostics();
    await agenticApp.writeClipboardText(diagnostics);
    setStatus("Copied", "Application diagnostics copied to clipboard");
  } catch (error) {
    setStatus("Error", error.message || "Unable to copy diagnostics");
  }
}

async function openDataFolder() {
  try {
    await agenticApp.openDataFolder();
    setStatus("Opened", "Application data folder");
  } catch (error) {
    setStatus("Error", error.message || "Unable to open application data");
  }
}

async function clearSessionHistory() {
  const confirmed = window.confirm(
    "Remove all stopped sessions and their saved terminal history? Running sessions will be kept.",
  );
  if (!confirmed) {
    return;
  }

  try {
    const result = await agenticApp.clearSessionHistory();
    const removed = Number(result?.removed) || 0;
    setStatus(
      "History cleared",
      `${removed} stopped session${removed === 1 ? "" : "s"} removed`,
    );
  } catch (error) {
    setStatus("Error", error.message || "Unable to clear session history");
  }
}

async function startSession(event) {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.startSession(event);
}

async function stopSession() {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.stopSession();
}

async function sendInterrupt() {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.sendInterrupt();
}

async function sendManualInterrupt(terminalId) {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.sendManualInterrupt(terminalId);
}

async function pickDirectory() {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.pickDirectory();
}

function toggleSessionPopover(forceOpen = null) {
  const shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : newSessionPopover.classList.contains("hidden");

  newSessionPopover.classList.toggle("hidden", !shouldOpen);

  if (shouldOpen) {
    commandInput.focus();
  }
}

function toggleProcessPanel() {
  if (!capabilities.processInspectionSupported) {
    return;
  }

  isProcessPanelOpen = !isProcessPanelOpen;
  toggleProcessPanelButton.classList.toggle("active", isProcessPanelOpen);
  renderProcessDetails(activeSessionId);

  if (isProcessPanelOpen) {
    pollSessionProcesses();
  }
}

window.addEventListener("resize", () => {
  if (windowResizeTimeoutId) {
    window.clearTimeout(windowResizeTimeoutId);
  }

  windowResizeTimeoutId = window.setTimeout(() => {
    windowResizeTimeoutId = null;
    void Promise.all([resizeSession(), resizeManualTerminals()]).catch(
      (error) => {
        console.error("Unable to resize terminal after window resize", error);
      },
    );
  }, WINDOW_RESIZE_DEBOUNCE_MS);
});

sessionForm.addEventListener("submit", startSession);
commandInput.addEventListener("input", scheduleCommandReadinessCheck);
commandInput.addEventListener("blur", () => void refreshCommandReadiness());
pickDirectoryButton.addEventListener("click", pickDirectory);
stopSessionButton.addEventListener("click", stopSession);
sendInterruptButton.addEventListener("click", sendInterrupt);
openFileDrawerButton.addEventListener("click", () => {
  openFileDrawer();
  if (activeSessionId) {
    renderSessionFileReferences(activeSessionId);
  }
});
manualSendInterruptButton.addEventListener("click", () => {
  const terminalId = getActiveManualTerminalId();
  if (terminalId) {
    sendManualInterrupt(terminalId);
  }
});
addManualTerminalButton.addEventListener("click", addManualTerminal);
manualTerminalTabs.addEventListener("click", async (event) => {
  const closeButton = event.target.closest(".manual-terminal-close");
  if (closeButton?.dataset.terminalId && activeSessionId) {
    event.preventDefault();
    event.stopPropagation();
    await closeManualTerminal(activeSessionId, closeButton.dataset.terminalId);
    return;
  }

  const tab = event.target.closest(".manual-terminal-tab");
  if (!tab?.dataset.terminalId || !activeSessionId) {
    return;
  }

  activeManualTerminalBySession.set(activeSessionId, tab.dataset.terminalId);
  renderManualTerminalTabs(activeSessionId);
  await showManualTerminal(activeSessionId, tab.dataset.terminalId);
  await resizeManualTerminal(tab.dataset.terminalId);
});
modifiedFilesList.addEventListener("click", async (event) => {
  const button = event.target.closest(".modified-file-button");
  if (!button?.dataset.filePath || !activeSessionId || openingReferencedFile) {
    return;
  }

  button.disabled = true;
  try {
    await openReferencedFile(activeSessionId, button.dataset.filePath);
  } finally {
    button.disabled = false;
  }
});
toggleProcessPanelButton.addEventListener("click", toggleProcessPanel);
newSessionButton.addEventListener("click", () => toggleSessionPopover());
openLauncherEmptyButton.addEventListener("click", () =>
  toggleSessionPopover(true),
);
copyDiagnosticsButton.addEventListener("click", copyDiagnostics);
openDataFolderButton.addEventListener("click", openDataFolder);
clearHistoryButton.addEventListener("click", clearSessionHistory);
const sessionPopoverDismissal = createPopoverDismissalController({
  popover: newSessionPopover,
  ignoredElements: [newSessionButton, openLauncherEmptyButton],
});

function selectSessionFromSidebar(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const tab = target.closest(".session-tab");
  if (tab?.dataset.sessionId) {
    event.preventDefault();
    openTerminalView(tab.dataset.sessionId);
  }
}

async function restartSessionFromSidebar(sessionId) {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.restartSessionFromSidebar(sessionId);
}

async function removeSessionFromSidebar(sessionId) {
  if (!sessionLifecycleHandlers) {
    return;
  }

  await sessionLifecycleHandlers.removeSessionFromSidebar(sessionId);
}

sessionLifecycleHandlers = createSessionLifecycleHandlers({
  setProcessInspectionSupport,
  cwdInput,
  setStatus,
  updateSessions,
  labelInput,
  commandInput,
  argsInput,
  ensureSessionBuffer,
  ensureSessionInsight,
  createSessionTerminal,
  getSessionDisplayName,
  closeSessionPopover: () => newSessionPopover.classList.add("hidden"),
  openTerminalView,
  getActiveSessionId: () => activeSessionId,
  markSessionInput,
  scheduleUiRefresh,
  showEmptyView,
  setSessionRestartPending,
});

sessionTabsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const renameBtn = target.closest(".session-action-rename");
  if (renameBtn?.dataset.sessionId) {
    event.preventDefault();
    event.stopPropagation();
    beginSessionRename(renameBtn.dataset.sessionId);
    return;
  }

  if (target.closest(".session-rename-input")) {
    event.stopPropagation();
    return;
  }

  const restartBtn = target.closest(".session-action-restart");
  if (restartBtn?.dataset.sessionId) {
    event.preventDefault();
    event.stopPropagation();
    restartSessionFromSidebar(restartBtn.dataset.sessionId);
    return;
  }

  const removeBtn = target.closest(".session-action-remove");
  if (removeBtn?.dataset.sessionId) {
    event.preventDefault();
    event.stopPropagation();
    removeSessionFromSidebar(removeBtn.dataset.sessionId);
    return;
  }

  selectSessionFromSidebar(event);
});
sessionTabsList.addEventListener("keydown", (event) => {
  const renameInput = event.target.closest?.(".session-rename-input");
  if (renameInput) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveSessionRename(renameInput);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelSessionRename(renameInput.dataset.sessionId);
    }
    event.stopPropagation();
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    selectSessionFromSidebar(event);
  }
});
sessionTabsList.addEventListener("focusout", (event) => {
  const renameInput = event.target.closest?.(".session-rename-input");
  if (renameInput) {
    void saveSessionRename(renameInput);
  }
});

agentFileLinksList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const entry = target.closest(".agent-file-entry");
  if (!entry?.dataset.filePath || !activeSessionId) {
    return;
  }

  if (openingReferencedFile) {
    return;
  }

  const fileLine = entry.dataset.fileLine
    ? Number(entry.dataset.fileLine)
    : null;
  entry.disabled = true;
  entry.classList.add("loading");

  try {
    await openReferencedFile(activeSessionId, entry.dataset.filePath, fileLine);
  } finally {
    entry.disabled = false;
    entry.classList.remove("loading");
  }
});

document.addEventListener("pointerdown", (event) => {
  sessionPopoverDismissal.handlePointerDown(event);
});

document.addEventListener("click", (event) => {
  if (
    !terminalContextMenu.classList.contains("hidden") &&
    !terminalContextMenu.contains(event.target)
  ) {
    closeTerminalContextMenu();
  }

  if (sessionPopoverDismissal.shouldDismiss(event)) {
    newSessionPopover.classList.add("hidden");
  }
});

function handleGlobalKeydown(event) {
  if (isShortcutKey(event, "c")) {
    event.preventDefault();
    triggerCopyOrInterruptShortcut();
    return;
  }

  if (shouldRunShortcut(SHORTCUT_ACTIONS.QUICK_OPEN, event)) {
    event.preventDefault();
    openVsCodeQuickOpen();
    return;
  }

  if (
    shouldRunShortcut(SHORTCUT_ACTIONS.FIND_IN_SESSION, event, {
      editorOpen: editorState.open,
      activeSessionId,
    })
  ) {
    event.preventDefault();
    openAgentSearch();
    return;
  }

  if (
    shouldRunShortcut(SHORTCUT_ACTIONS.SAVE_EDITOR, event, {
      editorOpen: editorState.open,
    })
  ) {
    event.preventDefault();
    saveOpenEditorFile("Saved");
    return;
  }

  if (shouldRunShortcut(SHORTCUT_ACTIONS.ESCAPE, event)) {
    if (quickOpenState.open) {
      closeQuickOpen();
      return;
    }

    if (isAgentSearchOpen) {
      closeAgentSearch();
      return;
    }

    if (editorState.open) {
      closeFileEditorModal();
      return;
    }

    closeTerminalContextMenu();
  }
}

window.addEventListener("agentic:quick-open", () => {
  openVsCodeQuickOpen();
});

agenticApp.onQuickOpenShortcut(() => {
  openVsCodeQuickOpen();
});

agenticApp.onCopyOrInterruptShortcut(() => {
  triggerCopyOrInterruptShortcut();
});

agenticApp.onWorkspaceFileChanged((file) => {
  applyOpenEditorFileChange(file);
});

window.addEventListener("keydown", handleGlobalKeydown, true);
document.addEventListener("keydown", handleGlobalKeydown, true);

if (
  quickOpenInput &&
  quickOpenResults &&
  quickOpenCloseButton &&
  quickOpenOverlay
) {
  quickOpenInput.addEventListener("input", () => {
    quickOpenState.activeIndex = 0;
    renderQuickOpenResults();
  });

  quickOpenInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openQuickOpenSelection();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveQuickOpenSelection("down");
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveQuickOpenSelection("up");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeQuickOpen();
    }
  });

  quickOpenResults.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest(".quick-open-result");
    if (!button?.dataset.index) {
      return;
    }

    openQuickOpenSelection(Number(button.dataset.index));
  });

  quickOpenCloseButton.addEventListener("click", () => {
    closeQuickOpen();
  });

  quickOpenOverlay.addEventListener("click", (event) => {
    if (event.target === quickOpenOverlay) {
      closeQuickOpen();
    }
  });
}

if (agentSearchEnabled) {
  agentSearchInput.addEventListener("input", () => {
    const term = agentSearchInput.value.trim();

    if (!term) {
      const searchAddon = getActiveAgentSearchAddon();
      if (searchAddon) {
        searchAddon.clearDecorations();
      }
      updateAgentSearchControls();
      return;
    }

    runAgentSearch("next", { incremental: true });
  });

  agentSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runAgentSearch(event.shiftKey ? "previous" : "next");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeAgentSearch();
    }
  });

  agentSearchPrevButton.addEventListener("click", () => {
    runAgentSearch("previous");
  });

  agentSearchNextButton.addEventListener("click", () => {
    runAgentSearch("next");
  });

  agentSearchCloseButton.addEventListener("click", () => {
    closeAgentSearch();
  });
}

fileEditorSaveButton.addEventListener("click", () => {
  saveOpenEditorFile("Saved");
});

fileEditorCloseButton.addEventListener("click", () => {
  closeFileEditorModal();
});

fileEditorAutosave.addEventListener("change", () => {
  editorState.autosave = fileEditorAutosave.checked;
  window.localStorage.setItem(
    "agentic-command-editor-autosave",
    editorState.autosave ? "1" : "0",
  );

  if (!editorState.autosave && autosaveTimeoutId) {
    window.clearTimeout(autosaveTimeoutId);
    autosaveTimeoutId = null;
  }
});

terminalContextCopyButton.addEventListener("click", async () => {
  if (terminalContextTarget) {
    await terminalClipboard.copyTargetSelection(terminalContextTarget);
  }
  closeTerminalContextMenu();
});

terminalContextPasteButton.addEventListener("click", async () => {
  if (terminalContextTarget) {
    await terminalClipboard.pasteIntoTerminal(terminalContextTarget.terminal);
  }
  closeTerminalContextMenu();
});

terminalContextClearButton.addEventListener("click", async () => {
  if (terminalContextTarget) {
    await sendTerminalClearCommand(terminalContextTarget);
  }
  closeTerminalContextMenu();
});

setTerminalActionsEnabled(null);
setStatus("Idle", "No active process");
const themeManager = createThemeManager({
  selectElement: themeSelect,
  onThemeApplied: ({ terminalTheme, monacoTheme }) => {
    activeTerminalTheme = terminalTheme;
    for (const instance of [
      ...sessionTerminals.values(),
      ...manualTerminals.values(),
    ]) {
      instance.terminal.options.theme = terminalTheme;
    }
    monacoApi?.editor.setTheme(monacoTheme);
  },
});
themeManager.initialize();
quickOpenState.recentPaths = loadQuickOpenRecents();
editorState.autosave =
  window.localStorage.getItem("agentic-command-editor-autosave") === "1";
fileEditorAutosave.checked = editorState.autosave;
bindGlobalEvents();
showEmptyView();
initializeContext().catch((error) => {
  setStatus("Error", error.message || "Unable to load app context");
});

setInterval(() => {
  refreshVisibleUi();
}, 3000);

setInterval(() => {
  if (activeSessionId) {
    void refreshModifiedFiles(activeSessionId);
  }
}, WORKSPACE_CHANGES_REFRESH_INTERVAL_MS);

async function pollSessionProcesses() {
  if (typeof agenticApp.getSessionProcesses !== "function") {
    return;
  }

  if (!capabilities.processInspectionSupported) {
    return;
  }

  for (const [id, session] of sessions.entries()) {
    if (!session.isRunning) {
      sessionProcesses.delete(id);
    }
  }

  if (!activeSessionId || !isProcessPanelOpen) {
    scheduleUiRefresh();
    return;
  }

  const activeSession = sessions.get(activeSessionId);
  if (!activeSession?.isRunning) {
    sessionProcesses.delete(activeSessionId);
    scheduleUiRefresh();
    return;
  }

  try {
    const result = await agenticApp.getSessionProcesses(activeSessionId);

    if (result?.supported === false) {
      setProcessInspectionSupport(false);
      sessionProcesses.delete(activeSessionId);
      scheduleUiRefresh();
      return;
    }

    setProcessInspectionSupport(result?.supported);
    sessionProcesses.set(activeSessionId, result?.processes || []);
  } catch {
    sessionProcesses.set(activeSessionId, []);
  }

  scheduleUiRefresh();
}

setInterval(pollSessionProcesses, 3000);
