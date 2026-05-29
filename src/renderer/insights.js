import {
  BENIGN_ERROR_PHRASES,
  ERROR_CLEAR_PATTERNS,
  ERROR_PATTERNS,
  IDLE_THRESHOLD_MS,
  PERMISSION_PATTERNS,
  QUESTION_PATTERNS,
  READY_PATTERNS,
} from "./constants.js";
import { sessionBuffers, sessionInsights } from "./state.js";
import { stripAnsi } from "./utils.js";

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
  { pattern: /[●◉◎○]\s+(?:loading|generating|thinking|working)/i, label: null },
];

const ATTENTION_STREAM_MAX_BUFFER = 8192;

function extractWorkingLabel(raw) {
  for (const { pattern, label } of WORKING_PATTERNS) {
    if (pattern.test(raw)) {
      if (label !== null) {
        return label;
      }

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

export function ensureSessionInsight(sessionId) {
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

export function markSessionInput(sessionId) {
  const insight = ensureSessionInsight(sessionId);
  insight.lastActivityAt = Date.now();
  insight.lastInputAt = Date.now();
  insight.lastReadyAt = null;
  insight.awaitingPermission = false;
  insight.awaitingQuestion = false;
  insight.hasError = false;
  insight.errorMessage = "";
  insight.lastErrorAt = null;
  insight.streamCarry = "";
}

function extractAttentionSnippet(rawData) {
  const lines = stripAnsi(rawData)
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.find(
      (line) =>
        line.length > 4 &&
        !/^[─━═╌╍┄┅┆┇╴╸╹╺╻╼╽╾╿│┃┌┐└┘├┤┬┴┼╭╮╯╰■□●○◉◎\-=|/\\]+$/.test(line) &&
        !/[\x00-\x1f\x7f]/.test(line),
    ) || ""
  ).slice(0, 72);
}

export function updateInsightFromOutput(sessionId, data) {
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
      insight.awaitingQuestion = false;
      insight.awaitingPermission = false;
    } else if (matchedReady) {
      insight.lastReadyAt = Date.now();
      insight.hasError = false;
      insight.errorMessage = "";
      insight.lastErrorAt = null;
      insight.awaitingQuestion = false;
      insight.awaitingPermission = false;
    } else if (matchedErrorClear) {
      insight.hasError = false;
      insight.errorMessage = "";
      insight.lastErrorAt = null;
      insight.awaitingQuestion = false;
      insight.awaitingPermission = false;
    }
  }
}

export function resetSessionInsight(sessionId) {
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

export function rehydrateInsightFromBuffer(session) {
  const buffer = sessionBuffers.get(session.id) || "";
  resetSessionInsight(session.id);

  if (!buffer) {
    return;
  }

  const tail = buffer.slice(-12000);
  updateInsightFromOutput(session.id, tail);
}

export function deriveAttentionStatus(session) {
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
