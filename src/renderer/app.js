import { Terminal } from "../../node_modules/@xterm/xterm/lib/xterm.mjs";
import { FitAddon } from "../../node_modules/@xterm/addon-fit/lib/addon-fit.mjs";

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
const manualSendInterruptButton = document.querySelector(
  "#manual-send-interrupt",
);
const toggleProcessPanelButton = document.querySelector(
  "#toggle-process-panel",
);
const workspaceTabAgentButton = document.querySelector("#workspace-tab-agent");
const workspaceTabTerminalButton = document.querySelector(
  "#workspace-tab-terminal",
);
const agentPane = document.querySelector("#agent-pane");
const manualPane = document.querySelector("#manual-pane");
const sessionStatus = document.querySelector("#session-status");
const sessionMeta = document.querySelector("#session-meta");
const sessionTabsList = document.querySelector("#session-tabs-list");
const terminalTitle = document.querySelector("#terminal-title");
const terminalSubtitle = document.querySelector("#terminal-subtitle");
const terminalContainer = document.querySelector("#terminal");
const manualTerminalSubtitle = document.querySelector(
  "#manual-terminal-subtitle",
);
const manualTerminalContainer = document.querySelector("#manual-terminal");
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

const IDLE_THRESHOLD_MS = 20000;
const UI_REFRESH_INTERVAL_MS = 150;

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

const sessions = new Map();
const sessionBuffers = new Map();
const sessionInsights = new Map();
const sessionTerminals = new Map();
const manualTerminals = new Map();
const manualTerminalBuffers = new Map();
const sessionProcesses = new Map();

let activeSessionId = null;
let refreshScheduled = false;
let refreshTimeoutId = null;
let isProcessPanelOpen = false;
let activeWorkspaceTab = "agent";
let terminalContextTarget = null;

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
  return (event.ctrlKey || event.metaKey) && !event.altKey && pressedKey === key;
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
  terminal.loadAddon(fitAddon);
  terminal.open(mount);
  const instance = {
    terminal,
    fitAddon,
    mount,
    sessionId,
    kind: "agent",
  };
  attachTerminalClipboardHandlers(instance);

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

function updateManualTerminalSubtitle(session) {
  if (!session) {
    manualTerminalSubtitle.textContent = "";
    return;
  }

  manualTerminalSubtitle.textContent = `${session.cwd} - Interactive shell`;
}

function createManualTerminal(sessionId) {
  if (manualTerminals.has(sessionId)) {
    return manualTerminals.get(sessionId);
  }

  const mount = document.createElement("div");
  mount.className = "terminal-instance hidden";
  mount.dataset.sessionId = sessionId;
  manualTerminalContainer.append(mount);

  const terminal = new Terminal(TERMINAL_OPTIONS);
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(mount);
  const instance = {
    terminal,
    fitAddon,
    mount,
    sessionId,
    kind: "manual",
    initialized: false,
  };
  attachTerminalClipboardHandlers(instance);

  terminal.onData((data) => {
    if (activeSessionId !== sessionId || activeWorkspaceTab !== "terminal") {
      return;
    }

    window.agenticApp.writeToManualTerminal(sessionId, data);
  });

  manualTerminals.set(sessionId, instance);
  return instance;
}

async function ensureManualTerminal(sessionId) {
  const instance = createManualTerminal(sessionId);
  if (instance.initialized) {
    return instance;
  }

  const result = await window.agenticApp.ensureManualTerminal(sessionId);
  const buffered =
    manualTerminalBuffers.get(sessionId) || result.outputBuffer || "";

  if (buffered) {
    instance.terminal.write(buffered);
  }

  manualTerminalBuffers.set(sessionId, buffered);
  instance.initialized = true;
  return instance;
}

async function showManualTerminal(sessionId) {
  for (const [id, instance] of manualTerminals.entries()) {
    instance.mount.classList.toggle("hidden", id !== sessionId);
  }

  const instance = await ensureManualTerminal(sessionId);
  instance.mount.classList.remove("hidden");
  instance.fitAddon.fit();
  instance.terminal.focus();
  return instance;
}

function getActiveManualTerminalInstance() {
  if (!activeSessionId) {
    return null;
  }

  return manualTerminals.get(activeSessionId) || null;
}

async function setWorkspaceTab(tab) {
  activeWorkspaceTab = tab === "terminal" ? "terminal" : "agent";

  const isAgent = activeWorkspaceTab === "agent";
  workspaceTabAgentButton.classList.toggle("active", isAgent);
  workspaceTabAgentButton.setAttribute("aria-selected", String(isAgent));
  workspaceTabTerminalButton.classList.toggle("active", !isAgent);
  workspaceTabTerminalButton.setAttribute("aria-selected", String(!isAgent));
  agentPane.classList.toggle("hidden", !isAgent);
  manualPane.classList.toggle("hidden", isAgent);

  if (!activeSessionId) {
    return;
  }

  const session = sessions.get(activeSessionId);
  if (session) {
    updateManualTerminalSubtitle(session);
  }

  if (isAgent) {
    showSessionTerminal(activeSessionId);
    await resizeSession();
    return;
  }

  try {
    await showManualTerminal(activeSessionId);
    await resizeManualTerminal();
  } catch (error) {
    setStatus("Error", error.message || "Unable to open integrated terminal");
    activeWorkspaceTab = "agent";
    await setWorkspaceTab("agent");
  }
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
  setTerminalActionsEnabled(active);
  renderProcessDetails(active.id);
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
    sessionTabsList.innerHTML =
      '<p class="status-meta">No sessions</p>';
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

  for (const instance of sessionTerminals.values()) {
    instance.mount.classList.add("hidden");
  }

  activeSessionId = null;
  activeWorkspaceTab = "agent";
  workspaceTabAgentButton.classList.add("active");
  workspaceTabAgentButton.setAttribute("aria-selected", "true");
  workspaceTabTerminalButton.classList.remove("active");
  workspaceTabTerminalButton.setAttribute("aria-selected", "false");
  agentPane.classList.remove("hidden");
  manualPane.classList.add("hidden");
  if (shouldRefresh) {
    refreshVisibleUi();
  }
}

function renderTerminalHeader(session) {
  terminalTitle.textContent = getSessionDisplayName(session);
  terminalSubtitle.textContent = `${session.cwd} - ${getSessionStatusLabel(session)}`;
}

function renderProcessDetails(sessionId) {
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
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  activeSessionId = sessionId;
  emptyView.classList.add("hidden");
  terminalView.classList.remove("hidden");
  renderSessionTabs();
  renderTerminalHeader(session);
  updateManualTerminalSubtitle(session);
  setTerminalActionsEnabled(session);
  renderProcessDetails(sessionId);

  await setWorkspaceTab(activeWorkspaceTab);
}

function updateSessions(payload) {
  const incomingIds = new Set(payload.map((session) => session.id));

  for (const existingId of sessions.keys()) {
    if (!incomingIds.has(existingId)) {
      sessionProcesses.delete(existingId);
      sessionInsights.delete(existingId);
      sessionBuffers.delete(existingId);
      manualTerminalBuffers.delete(existingId);
      const manualInstance = manualTerminals.get(existingId);
      if (manualInstance) {
        manualInstance.mount.remove();
        manualTerminals.delete(existingId);
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

    const instance = sessionTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(data);
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

  window.agenticApp.onManualTerminalData(({ sessionId, data }) => {
    manualTerminalBuffers.set(
      sessionId,
      `${manualTerminalBuffers.get(sessionId) || ""}${data}`,
    );

    const instance = manualTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(data);
    }
  });

  window.agenticApp.onManualTerminalExit(({ sessionId, exitCode, signal }) => {
    const exitLine = `\r\n[terminal exited: ${exitCode}${signal ? `, signal ${signal}` : ""}]\r\n`;
    manualTerminalBuffers.set(
      sessionId,
      `${manualTerminalBuffers.get(sessionId) || ""}${exitLine}`,
    );

    const instance = manualTerminals.get(sessionId);
    if (instance) {
      instance.terminal.write(exitLine);
    }
  });

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

async function resizeManualTerminal() {
  const instance = getActiveManualTerminalInstance();
  if (!activeSessionId || !instance) {
    return;
  }

  instance.fitAddon.fit();
  await window.agenticApp.resizeManualTerminal(activeSessionId, {
    cols: instance.terminal.cols,
    rows: instance.terminal.rows,
  });
}

async function initializeContext() {
  const context = await window.agenticApp.getContext();
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

async function sendManualInterrupt() {
  if (!activeSessionId) {
    return;
  }

  await window.agenticApp.writeToManualTerminal(activeSessionId, "\u0003");
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
  isProcessPanelOpen = !isProcessPanelOpen;
  toggleProcessPanelButton.classList.toggle("active", isProcessPanelOpen);
  renderProcessDetails(activeSessionId);

  if (isProcessPanelOpen) {
    pollSessionProcesses();
  }
}

window.addEventListener("resize", () => {
  if (activeWorkspaceTab === "terminal") {
    resizeManualTerminal();
  } else {
    resizeSession();
  }
});

sessionForm.addEventListener("submit", startSession);
pickDirectoryButton.addEventListener("click", pickDirectory);
stopSessionButton.addEventListener("click", stopSession);
sendInterruptButton.addEventListener("click", sendInterrupt);
manualSendInterruptButton.addEventListener("click", sendManualInterrupt);
toggleProcessPanelButton.addEventListener("click", toggleProcessPanel);
workspaceTabAgentButton.addEventListener("click", () =>
  setWorkspaceTab("agent"),
);
workspaceTabTerminalButton.addEventListener("click", () =>
  setWorkspaceTab("terminal"),
);
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTerminalContextMenu();
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
    sessionProcesses.set(activeSessionId, result.processes || []);
  } catch {
    sessionProcesses.set(activeSessionId, []);
  }

  scheduleUiRefresh();
}

setInterval(pollSessionProcesses, 3000);
