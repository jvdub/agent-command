import { Terminal } from "../../node_modules/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs";
import { SearchAddon } from "../../node_modules/@xterm/addon-search/lib/addon-search.mjs";
import { WebLinksAddon } from "../../node_modules/@xterm/addon-web-links/lib/addon-web-links.mjs";

const emptyView = document.querySelector("#empty-view");
const terminalView = document.querySelector("#terminal-view");
const sessionForm = document.querySelector("#session-form");
const newSessionButton = document.querySelector("#new-session-button");
const newSessionPopover = document.querySelector("#new-session-popover");
const openLauncherEmptyButton = document.querySelector("#open-launcher-empty");
const labelInput = document.querySelector("#label");
const commandInput = document.querySelector("#command");
const argsInput = document.querySelector("#args");
const cwdInput = document.querySelector("#cwd");
const pickDirectoryButton = document.querySelector("#pick-directory");
const stopSessionButton = document.querySelector("#stop-session");
const sendInterruptButton = document.querySelector("#send-interrupt");
const openFileDrawerButton = document.querySelector("#open-file-drawer");
const manualSendInterruptButton1 = document.querySelector(
  "#manual-send-interrupt-1",
);
const manualSendInterruptButton2 = document.querySelector(
  "#manual-send-interrupt-2",
);
const toggleProcessPanelButton = document.querySelector(
  "#toggle-process-panel",
);
const agentPane = document.querySelector("#agent-pane");
const manualPane1 = document.querySelector("#manual-pane-1");
const manualPane2 = document.querySelector("#manual-pane-2");
const rightPane = document.querySelector("#right-pane");
const sessionStatus = document.querySelector("#session-status");
const sessionMeta = document.querySelector("#session-meta");
const sessionTabsList = document.querySelector("#session-tabs-list");
const terminalTitle = document.querySelector("#terminal-title");
const terminalSubtitle = document.querySelector("#terminal-subtitle");
const agentSearchBar = document.querySelector("#agent-search-bar");
const agentSearchInput = document.querySelector("#agent-search-input");
const agentSearchCount = document.querySelector("#agent-search-count");
const agentSearchPrevButton = document.querySelector("#agent-search-prev");
const agentSearchNextButton = document.querySelector("#agent-search-next");
const agentSearchCloseButton = document.querySelector("#agent-search-close");
const terminalContainer = document.querySelector("#terminal");
const manualTerminalSubtitle1 = document.querySelector(
  "#manual-terminal-subtitle-1",
);
const manualTerminalSubtitle2 = document.querySelector(
  "#manual-terminal-subtitle-2",
);
const manualTerminalContainer1 = document.querySelector("#manual-terminal-1");
const manualTerminalContainer2 = document.querySelector("#manual-terminal-2");
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

const IDLE_THRESHOLD_MS = 20000;
const UI_REFRESH_INTERVAL_MS = 150;
const FILE_REFERENCE_LIMIT = 24;
const AUTOSAVE_DELAY_MS = 1000;
const FILE_REFERENCE_PATTERN =
  /(^|[\s("'`])((?:\.{1,2}\/|~\/|\/)?(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:[cm]?[jt]sx?|json|md|css|scss|html?|py|java|go|rs|sh|yml|yaml|toml|xml))(?:[:#](\d+))?/g;
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
  /\bpermission\b.{0,40}\b(required|needed|request(?:ed)?)\b/i,
  /\bawaiting\b.{0,30}\bapproval\b/i,
  /\bapprove\s+or\s+deny\b/i,
  // y/n choice indicators
  /\(y\/n\)|\[y\/n\]|\by\/n\b/i,
  /\((?:yes|y)\/(?:no|n)\)|\[(?:yes|y)\/(?:no|n)\]/i,
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
  /\btype\s*:\s*question\b/i,
  /\bquestion\s*:\s*/i,
  /\bwhat\s+should\b/i,
  /\bhow\s+should\b/i,
  /\bwhich\s+(?:option|approach|file|version|branch)\b/i,
  /\bselect\b.+\boption\b/i,
  /\benter\b.+\bchoice\b/i,
  /\bplease\s+(?:choose|select|pick|specify|provide)\b/i,
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
  theme: {
    background: "#12151c",
    foreground: "#f5f2e8",
    cursor: "#ee6c4d",
    selectionBackground: "rgba(238, 108, 77, 0.25)",
    black: "#101217",
    brightBlack: "#5f6675",
    red: "#f47d6b",
    green: "#8ccf7e",
    yellow: "#f3be7c",
    blue: "#78b8e6",
    magenta: "#d68fd6",
    cyan: "#65cbd0",
    white: "#f5f2e8",
  },
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
const sessionProcesses = new Map();
const sessionFileReferences = new Map();
const capabilities = {
  processInspectionSupported: true,
};

let activeSessionId = null;
let refreshScheduled = false;
let refreshTimeoutId = null;
let isProcessPanelOpen = false;
let terminalContextTarget = null;
let monacoEditor = null;
let monacoApi = null;
let monacoLoaderPromise = null;
let editorModel = null;

const MONACO_LOADER_PATH = "../../node_modules/monaco-editor/min/vs/loader.js";
const MONACO_VS_BASE_PATH = "../../node_modules/monaco-editor/min/vs";
let autosaveTimeoutId = null;
let suppressEditorChange = false;
let editorState = {
  open: false,
  sessionId: null,
  filePath: "",
  relativePath: "",
  dirty: false,
  autosave: false,
};

let isAgentSearchOpen = false;

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
  sessionStatus.textContent = label;
  sessionMeta.textContent = meta;
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

function collectFileReferences(rawChunk) {
  const plainText = stripAnsi(rawChunk);
  const refs = [];
  let match;

  while ((match = FILE_REFERENCE_PATTERN.exec(plainText)) !== null) {
    const normalized = normalizeCandidateFilePath(match[2]);
    if (!normalized) {
      continue;
    }

    refs.push({
      filePath: normalized,
      line: match[3] ? Number(match[3]) : null,
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

  const existing = ensureSessionFileReferences(sessionId);
  const byPath = new Map(existing.map((entry) => [entry.filePath, entry]));

  for (const ref of found) {
    byPath.set(ref.filePath, {
      filePath: ref.filePath,
      line: Number.isInteger(ref.line) ? ref.line : null,
      updatedAt: Date.now(),
    });
  }

  const sorted = Array.from(byPath.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, FILE_REFERENCE_LIMIT);

  sessionFileReferences.set(sessionId, sorted);
}

function renderSessionFileReferences(sessionId) {
  if (!sessionId) {
    agentFileLinks.classList.add("hidden");
    agentFileLinksList.innerHTML = "";
    return;
  }

  const refs = sessionFileReferences.get(sessionId) || [];
  if (refs.length === 0) {
    agentFileLinks.classList.add("hidden");
    agentFileLinksList.innerHTML = "";
    return;
  }

  const chips = refs
    .map((ref) => {
      const suffix = Number.isInteger(ref.line) ? `:${ref.line}` : "";
      return `
        <button
          type="button"
          class="agent-file-chip"
          data-file-path="${escapeHtml(ref.filePath)}"
          data-file-line="${Number.isInteger(ref.line) ? ref.line : ""}"
          title="Open ${escapeHtml(ref.filePath)}"
        >${escapeHtml(ref.filePath)}${suffix}</button>
      `;
    })
    .join("");

  agentFileLinksList.innerHTML = chips;
  agentFileLinks.classList.remove("hidden");
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

function openFileDrawer() {
  fileDrawer.classList.remove("hidden");
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
  return uniqueStrings([MONACO_LOADER_PATH, absolute]);
}

function monacoVsBaseCandidates() {
  const absolute = new URL(`${MONACO_VS_BASE_PATH}/`, window.location.href)
    .toString()
    .replace(/\/$/, "");
  return uniqueStrings([MONACO_VS_BASE_PATH, absolute]);
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
        theme: "vs-dark",
      });

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
    await window.agenticApp.saveWorkspaceFile(
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

async function openReferencedFile(sessionId, filePath, lineNumber = null) {
  try {
    const file = await window.agenticApp.openWorkspaceFile(sessionId, filePath);
    await ensureMonacoEditor();

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
    editorState.relativePath = file.relativePath;
    editorState.dirty = false;

    setEditorStatus(`Opened ${file.relativePath}`);
    monacoEditor.focus();
  } catch (error) {
    setStatus("Error", error.message || "Unable to open referenced file");
  } finally {
    suppressEditorChange = false;
  }
}

function ensureSessionBuffer(sessionId) {
  if (!sessionBuffers.has(sessionId)) {
    sessionBuffers.set(sessionId, "");
  }
}

function appendSessionBuffer(sessionId, chunk) {
  ensureSessionBuffer(sessionId);
  sessionBuffers.set(sessionId, `${sessionBuffers.get(sessionId)}${chunk}`);
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
    });
  }

  return sessionInsights.get(sessionId);
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
  const normalized = stripAnsi(data).toLowerCase();
  insight.lastActivityAt = Date.now();

  if (PERMISSION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    insight.awaitingPermission = true;
    insight.awaitingQuestion = false;
    insight.permissionDetail = extractAttentionSnippet(data);
  } else if (QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    insight.awaitingQuestion = true;
    insight.awaitingPermission = false;
    insight.questionDetail = extractAttentionSnippet(data);
  }

  const containsError = ERROR_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  const looksBenign = BENIGN_ERROR_PHRASES.some((pattern) =>
    pattern.test(normalized),
  );

  if (containsError && !looksBenign) {
    insight.hasError = true;
    insight.lastErrorAt = Date.now();
    insight.errorMessage = stripAnsi(data).trim().slice(0, 80);
  }

  const workingLabel = extractWorkingLabel(normalized);
  const matchedReady = READY_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  const matchedErrorClear = ERROR_CLEAR_PATTERNS.some((pattern) =>
    pattern.test(normalized),
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
  } else if (matchedErrorClear) {
    insight.hasError = false;
    insight.errorMessage = "";
    insight.lastErrorAt = null;
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
  const chunks = tail.split(/\r?\n/).filter(Boolean);

  for (const chunk of chunks) {
    updateInsightFromOutput(session.id, chunk);
  }
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

function isClipboardShortcut(event, key) {
  const pressedKey = String(event.key || "").toLowerCase();
  return (
    (event.ctrlKey || event.metaKey) && !event.altKey && pressedKey === key
  );
}

function isFindShortcut(event) {
  const pressedKey = String(event.key || "").toLowerCase();
  const pressedCode = String(event.code || "").toLowerCase();
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    (pressedKey === "f" || pressedCode === "keyf")
  );
}

async function copyTerminalSelection(terminal) {
  const selection = terminal.getSelection();
  if (!selection) {
    return false;
  }

  await window.agenticApp.writeClipboardText(selection);
  return true;
}

async function pasteIntoTerminal(terminal) {
  const text = await window.agenticApp.readClipboardText();
  if (!text) {
    return false;
  }

  terminal.paste(text);
  return true;
}

function clearTerminalViewport(terminal) {
  terminal.clear();
}

function closeTerminalContextMenu() {
  terminalContextMenu.classList.add("hidden");
  terminalContextTarget = null;
}

function setAgentSearchMessage(message, isError = false) {
  agentSearchCount.textContent = message;
  agentSearchCount.classList.toggle("error", isError);
}

function getActiveAgentSearchAddon() {
  return getActiveTerminalInstance()?.searchAddon || null;
}

function updateAgentSearchControls() {
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
  const searchAddon = getActiveAgentSearchAddon();
  if (searchAddon) {
    searchAddon.clearDecorations();
  }

  agentSearchInput.value = "";
  updateAgentSearchControls();
}

function closeAgentSearch({ restoreFocus = true, clear = true } = {}) {
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

  const selection = target.terminal.getSelection();
  terminalContextCopyButton.disabled = !selection;

  const menuWidth = 152;
  const menuHeight = 132;
  const left = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
  const top = Math.min(event.clientY, window.innerHeight - menuHeight - 12);

  terminalContextMenu.style.left = `${Math.max(12, left)}px`;
  terminalContextMenu.style.top = `${Math.max(12, top)}px`;
  terminalContextMenu.classList.remove("hidden");
}

function attachTerminalClipboardHandlers(target) {
  const { terminal, mount } = target;

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") {
      return true;
    }

    if (isClipboardShortcut(event, "c") && terminal.hasSelection()) {
      event.preventDefault();
      copyTerminalSelection(terminal);
      return false;
    }

    if (isClipboardShortcut(event, "v")) {
      event.preventDefault();
      pasteIntoTerminal(terminal);
      return false;
    }

    if (target.kind === "agent" && isFindShortcut(event)) {
      event.preventDefault();
      openAgentSearch();
      return false;
    }

    return true;
  });

  mount.addEventListener("copy", (event) => {
    const selection = terminal.getSelection();
    if (!selection) {
      return;
    }

    event.preventDefault();
    window.agenticApp.writeClipboardText(selection);
  });

  mount.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text");
    if (!text) {
      return;
    }

    event.preventDefault();
    terminal.paste(text);
  });

  mount.addEventListener("contextmenu", (event) => {
    openTerminalContextMenu(event, target);
  });
}

async function sendTerminalClearCommand(target) {
  if (!target?.sessionId) {
    return;
  }

  if (target.kind === "manual") {
    await window.agenticApp.writeToManualTerminal(target.sessionId, "clear\r");
    return;
  }

  markSessionInput(target.sessionId);
  scheduleUiRefresh();
  await window.agenticApp.writeToSession(target.sessionId, "/clear\r");
}

function createWebLinksAddon(instance) {
  return new WebLinksAddon((event, uri) => {
    event?.preventDefault?.();

    Promise.resolve(window.agenticApp.openExternalUrl(uri))
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

function createSessionTerminal(sessionId) {
  if (sessionTerminals.has(sessionId)) {
    return sessionTerminals.get(sessionId);
  }

  const mount = document.createElement("div");
  mount.className = "terminal-instance hidden";
  mount.dataset.sessionId = sessionId;
  terminalContainer.append(mount);

  const terminal = new Terminal(TERMINAL_OPTIONS);
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
    window.agenticApp.writeToSession(sessionId, data);
  });

  sessionTerminals.set(sessionId, instance);

  const buffer = sessionBuffers.get(sessionId);
  if (buffer) {
    terminal.write(buffer);
  }

  return instance;
}

function showSessionTerminal(sessionId) {
  for (const [id, instance] of sessionTerminals.entries()) {
    instance.mount.classList.toggle("hidden", id !== sessionId);
  }

  const instance = createSessionTerminal(sessionId);
  instance.mount.classList.remove("hidden");
  instance.fitAddon.fit();
  instance.terminal.focus();
  return instance;
}

function getActiveTerminalInstance() {
  if (!activeSessionId) {
    return null;
  }

  return sessionTerminals.get(activeSessionId) || null;
}

function updateManualTerminalSubtitle(session, terminalId) {
  const target =
    terminalId === "2" ? manualTerminalSubtitle2 : manualTerminalSubtitle1;
  if (!session) {
    target.textContent = "";
    return;
  }

  target.textContent = `${session.cwd} - Interactive shell`;
}

function getManualTerminalContainer(terminalId) {
  return terminalId === "2"
    ? manualTerminalContainer2
    : manualTerminalContainer1;
}

function createManualTerminal(sessionId, terminalId) {
  const key = manualTerminalKey(sessionId, terminalId);
  if (manualTerminals.has(key)) {
    return manualTerminals.get(key);
  }

  const container = getManualTerminalContainer(terminalId);
  const mount = document.createElement("div");
  mount.className = "terminal-instance hidden";
  mount.dataset.sessionId = sessionId;
  mount.dataset.terminalId = terminalId;
  container.append(mount);

  const terminal = new Terminal(TERMINAL_OPTIONS);
  const fitAddon = new FitAddon();
  const webLinksAddon = createWebLinksAddon({
    sessionId,
    kind: "manual",
  });
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);
  terminal.open(mount);
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

    window.agenticApp.writeToManualTerminal(sessionId, data, terminalId);
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

  const result = await window.agenticApp.ensureManualTerminal(
    sessionId,
    terminalId,
  );
  const buffered = manualTerminalBuffers.get(key) || result.outputBuffer || "";

  if (buffered) {
    instance.terminal.write(buffered);
  }

  manualTerminalBuffers.set(key, buffered);
  instance.initialized = true;
  return instance;
}

async function showManualTerminal(sessionId, terminalId) {
  for (const instance of manualTerminals.values()) {
    const isVisible = instance.sessionId === sessionId;
    instance.mount.classList.toggle("hidden", !isVisible);
  }

  const instance = await ensureManualTerminal(sessionId, terminalId);
  instance.mount.classList.remove("hidden");
  instance.fitAddon.fit();
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
  updateManualTerminalSubtitle(active, "1");
  updateManualTerminalSubtitle(active, "2");
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
  const allSessions = Array.from(sessions.values()).sort(
    (left, right) => right.createdAt - left.createdAt,
  );

  if (allSessions.length === 0) {
    sessionTabsList.innerHTML = '<p class="status-meta">No sessions</p>';
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

      if (!session.isRunning) {
        return `
          <div class="session-tab-group ${isActive ? "active" : ""}">
            <button type="button" class="session-tab stopped-tab ${isActive ? "active" : ""}" data-session-id="${session.id}">
              <div class="session-tab-top">
                <p class="session-tab-name">${escapeHtml(getSessionDisplayName(session))}</p>
                <p class="session-tab-id">#${shortId(session.id)}</p>
              </div>
              <p class="session-tab-attention">${attention.label}</p>
            </button>
            <div class="session-tab-actions">
              <button type="button" class="session-action-restart" data-session-id="${session.id}" title="Restart session">Restart</button>
              <button type="button" class="session-action-remove" data-session-id="${session.id}" title="Remove session">Remove</button>
            </div>
          </div>
        `;
      }

      return `
        <button type="button" class="session-tab ${isActive ? "active" : ""} ${attention.className}" data-session-id="${session.id}">
          <div class="session-tab-top">
            <p class="session-tab-name">${escapeHtml(getSessionDisplayName(session))}</p>
            <p class="session-tab-id">#${shortId(session.id)}</p>
          </div>
          <p class="session-tab-attention">${attention.label}</p>
          ${procSummary ? `<p class="session-tab-proc">Process: ${procSummary}</p>` : ""}
        </button>
      `;
    })
    .join("");

  sessionTabsList.innerHTML = tabs;
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

async function openTerminalView(sessionId) {
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
  emptyView.classList.add("hidden");
  terminalView.classList.remove("hidden");
  renderSessionTabs();
  renderTerminalHeader(session);
  updateManualTerminalSubtitle(session, "1");
  updateManualTerminalSubtitle(session, "2");
  setTerminalActionsEnabled(session);
  renderProcessDetails(sessionId);
  showSessionTerminal(sessionId);
  await resizeSession();
  await showManualTerminal(sessionId, "1");
  await showManualTerminal(sessionId, "2");
  await resizeManualTerminals();
}

function updateSessions(payload) {
  const incomingIds = new Set(payload.map((session) => session.id));

  for (const existingId of sessions.keys()) {
    if (!incomingIds.has(existingId)) {
      sessionProcesses.delete(existingId);
      sessionInsights.delete(existingId);
      sessionBuffers.delete(existingId);
      sessionFileReferences.delete(existingId);
      for (const key of Array.from(manualTerminalBuffers.keys())) {
        if (key.startsWith(`${existingId}:`)) {
          manualTerminalBuffers.delete(key);
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
      incomingBuffer !== null ? incomingBuffer : priorBuffer,
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
  window.agenticApp.onSessionData(({ sessionId, data }) => {
    updateInsightFromOutput(sessionId, data);
    appendSessionBuffer(sessionId, data);
    ingestFileReferences(sessionId, data);

    const instance = sessionTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(data);
    }

    if (activeSessionId === sessionId) {
      renderSessionFileReferences(sessionId);
    }

    scheduleUiRefresh();
  });

  window.agenticApp.onSessionExit(({ sessionId, exitCode, signal }) => {
    const insight = ensureSessionInsight(sessionId);
    insight.awaitingPermission = false;
    insight.awaitingQuestion = false;
    if (exitCode !== 0) {
      insight.hasError = true;
      insight.errorMessage = `Exited with code ${exitCode}`;
      insight.lastErrorAt = Date.now();
    }

    const exitLine = `\r\n[session exited: ${exitCode}${signal ? `, signal ${signal}` : ""}]\r\n`;
    appendSessionBuffer(sessionId, exitLine);

    const instance = sessionTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(exitLine);
    }

    scheduleUiRefresh();
  });

  window.agenticApp.onManualTerminalData(({ sessionId, terminalId, data }) => {
    const key = manualTerminalKey(sessionId, String(terminalId || "1"));
    manualTerminalBuffers.set(
      key,
      `${manualTerminalBuffers.get(key) || ""}${data}`,
    );

    const instance = manualTerminals.get(key);
    if (instance) {
      instance.terminal.write(data);
    }
  });

  window.agenticApp.onManualTerminalExit(
    ({ sessionId, terminalId, exitCode, signal }) => {
      const key = manualTerminalKey(sessionId, String(terminalId || "1"));
      const exitLine = `\r\n[terminal exited: ${exitCode}${signal ? `, signal ${signal}` : ""}]\r\n`;
      manualTerminalBuffers.set(
        key,
        `${manualTerminalBuffers.get(key) || ""}${exitLine}`,
      );

      const instance = manualTerminals.get(key);
      if (instance) {
        instance.terminal.write(exitLine);
      }
    },
  );

  window.agenticApp.onSessionsChanged((payload) => {
    updateSessions(payload);
  });
}

async function resizeSession() {
  const instance = getActiveTerminalInstance();
  if (!activeSessionId || !instance) {
    return;
  }

  instance.fitAddon.fit();
  await window.agenticApp.resizeSession(activeSessionId, {
    cols: instance.terminal.cols,
    rows: instance.terminal.rows,
  });
}

async function resizeManualTerminal(terminalId) {
  const instance = getManualTerminalInstance(activeSessionId, terminalId);
  if (!activeSessionId || !instance) {
    return;
  }

  instance.fitAddon.fit();
  await window.agenticApp.resizeManualTerminal(
    activeSessionId,
    {
      cols: instance.terminal.cols,
      rows: instance.terminal.rows,
    },
    terminalId,
  );
}

async function resizeManualTerminals() {
  await Promise.all([resizeManualTerminal("1"), resizeManualTerminal("2")]);
}

async function initializeContext() {
  const context = await window.agenticApp.getContext();
  setProcessInspectionSupport(context.processInspectionSupported);
  cwdInput.value = context.cwd;
  setStatus("Idle", `Default directory ${context.cwd}`);

  const existing = await window.agenticApp.listSessions();
  updateSessions(existing.sessions || []);

  const runningCount = (existing.sessions || []).filter(
    (session) => session.isRunning,
  ).length;
  if (runningCount > 0) {
    setStatus(
      "Restored",
      `${runningCount} running session${runningCount === 1 ? "" : "s"} recovered`,
    );
  }
}

async function startSession(event) {
  event.preventDefault();

  const command = commandInput.value.trim();
  const label = labelInput?.value?.trim() || "";
  const args = argsInput.value;
  const cwd = cwdInput.value.trim();

  if (!command) {
    setStatus("Error", "Command is required");
    return;
  }

  try {
    const cols = 120;
    const rows = 36;
    const result = await window.agenticApp.startSession({
      label,
      command,
      args,
      cwd,
      cols,
      rows,
    });
    const session = result.session;

    ensureSessionBuffer(session.id);
    ensureSessionInsight(session.id);
    createSessionTerminal(session.id);

    setStatus("Running", `${getSessionDisplayName(session)} (${session.cwd})`);
    newSessionPopover.classList.add("hidden");
    openTerminalView(session.id);
  } catch (error) {
    setStatus("Error", error.message || "Unable to start session");
  }
}

async function stopSession() {
  if (!activeSessionId) {
    return;
  }

  try {
    await window.agenticApp.stopSession(activeSessionId);
    setStatus("Stopped", "Session terminated by user");
  } catch (error) {
    setStatus("Error", error.message || "Unable to stop session");
  }
}

async function sendInterrupt() {
  if (!activeSessionId) {
    return;
  }

  await window.agenticApp.writeToSession(activeSessionId, "\u0003");
  markSessionInput(activeSessionId);
  scheduleUiRefresh();
}

async function sendManualInterrupt(terminalId) {
  if (!activeSessionId) {
    return;
  }

  await window.agenticApp.writeToManualTerminal(
    activeSessionId,
    "\u0003",
    terminalId,
  );
}

async function pickDirectory() {
  const selected = await window.agenticApp.pickDirectory();
  if (selected) {
    cwdInput.value = selected;
  }
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
  resizeSession();
  resizeManualTerminals();
});

sessionForm.addEventListener("submit", startSession);
pickDirectoryButton.addEventListener("click", pickDirectory);
stopSessionButton.addEventListener("click", stopSession);
sendInterruptButton.addEventListener("click", sendInterrupt);
openFileDrawerButton.addEventListener("click", () => {
  openFileDrawer();
  if (activeSessionId) {
    renderSessionFileReferences(activeSessionId);
  }
});
manualSendInterruptButton1.addEventListener("click", () =>
  sendManualInterrupt("1"),
);
manualSendInterruptButton2.addEventListener("click", () =>
  sendManualInterrupt("2"),
);
toggleProcessPanelButton.addEventListener("click", toggleProcessPanel);
newSessionButton.addEventListener("click", () => toggleSessionPopover());
openLauncherEmptyButton.addEventListener("click", () =>
  toggleSessionPopover(true),
);

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
  try {
    const result = await window.agenticApp.restartSession(sessionId);
    const session = result.session;

    ensureSessionBuffer(session.id);
    ensureSessionInsight(session.id);
    createSessionTerminal(session.id);

    setStatus("Running", `${getSessionDisplayName(session)} (${session.cwd})`);
    openTerminalView(session.id);
  } catch (error) {
    setStatus("Error", error.message || "Unable to restart session");
  }
}

async function removeSessionFromSidebar(sessionId) {
  try {
    await window.agenticApp.removeSession(sessionId);
    setStatus("Removed", "Session deleted");
    if (activeSessionId === sessionId) {
      showEmptyView(false);
    }
  } catch (error) {
    setStatus("Error", error.message || "Unable to remove session");
  }
}

sessionTabsList.addEventListener("pointerdown", selectSessionFromSidebar);
sessionTabsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
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
});
sessionTabsList.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    selectSessionFromSidebar(event);
  }
});

agentFileLinksList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const chip = target.closest(".agent-file-chip");
  if (!chip?.dataset.filePath || !activeSessionId) {
    return;
  }

  const fileLine = chip.dataset.fileLine ? Number(chip.dataset.fileLine) : null;
  openReferencedFile(activeSessionId, chip.dataset.filePath, fileLine);
});

document.addEventListener("click", (event) => {
  if (
    !terminalContextMenu.classList.contains("hidden") &&
    !terminalContextMenu.contains(event.target)
  ) {
    closeTerminalContextMenu();
  }

  if (newSessionPopover.classList.contains("hidden")) {
    return;
  }

  const target = event.target;
  if (
    newSessionPopover.contains(target) ||
    newSessionButton.contains(target) ||
    openLauncherEmptyButton.contains(target)
  ) {
    return;
  }

  newSessionPopover.classList.add("hidden");
});

window.addEventListener(
  "keydown",
  (event) => {
  if (
    !editorState.open &&
    isFindShortcut(event)
  ) {
    if (activeSessionId) {
      event.preventDefault();
      openAgentSearch();
    }
    return;
  }

  if (
    editorState.open &&
    (event.key === "s" || event.key === "S") &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();
    saveOpenEditorFile("Saved");
    return;
  }

  if (event.key === "Escape") {
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
  },
  true,
);

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
    await copyTerminalSelection(terminalContextTarget.terminal);
  }
  closeTerminalContextMenu();
});

terminalContextPasteButton.addEventListener("click", async () => {
  if (terminalContextTarget) {
    await pasteIntoTerminal(terminalContextTarget.terminal);
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

async function pollSessionProcesses() {
  if (typeof window.agenticApp.getSessionProcesses !== "function") {
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
    const result = await window.agenticApp.getSessionProcesses(activeSessionId);

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
