export const IDLE_THRESHOLD_MS = 20000;
export const UI_REFRESH_INTERVAL_MS = 150;
export const FILE_REFERENCE_LIMIT = 24;
export const AUTOSAVE_DELAY_MS = 1000;

export const FILE_REFERENCE_PATTERN =
  /(?<![A-Za-z0-9._\\/\-])((?:(?:[A-Z]:\\|\\\\[A-Za-z0-9._\-]+\\|\.{1,2}[\\\/]|~\/|\/)(?:[A-Za-z0-9._\-]+[\\\/])*[A-Za-z0-9._\-]+|(?:[A-Za-z0-9._\-]+[\\\/])+[A-Za-z0-9._\-]+|[A-Za-z0-9._\-]+\.[A-Za-z0-9._\-]+|\.[A-Za-z0-9._\-]+))(?:[:#](\d+))?(?![A-Za-z0-9._\\/\-])/g;

export const LANGUAGE_BY_EXTENSION = {
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

export const PERMISSION_PATTERNS = [
  /\bproceed\b.{0,30}\?/i,
  /\bconfirm\b.{0,30}\?/i,
  /\ballow\b.{0,40}\?/i,
  /\bapprove\b.{0,30}\?/i,
  /\(y\/n\)|\[y\/n\]|\by\/n\b/i,
  /press\s+y\s+to|type\s+y\s+to/i,
  /allow\s+this\s+tool/i,
  /allow\s+tool\s+(call|use)/i,
  /run\s+this\s+command/i,
  /execute\s+this\s+command/i,
  /allow\s+(?:bash|shell|file|code)/i,
  /tool\s+(?:call|use)\s*:/i,
  /shall\s+i\s+proceed/i,
  /would\s+you\s+like\s+me\s+to/i,
  /do\s+you\s+want\s+me\s+to/i,
  /may\s+i\s+(?:run|execute|delete|write|modify)/i,
  /\bgrant\b.{0,20}\?/i,
  /\bdeny\b.{0,20}\?/i,
  /\breject\b.{0,20}\?/i,
];

export const QUESTION_PATTERNS = [
  /^(?!.*\by\/n\b).*\?\s*$/m,
  /\bwhat\s+should\b/i,
  /\bhow\s+should\b/i,
  /\bwhich\s+(?:option|approach|file|version|branch)\b/i,
  /\bselect\b.+\boption\b/i,
  /\benter\b.+\bchoice\b/i,
  /\bplease\s+(?:choose|select|pick|specify)\b/i,
];

export const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /\bfailed\b/i,
  /\bfatal\b/i,
  /\bunhandled\b/i,
];

export const BENIGN_ERROR_PHRASES = [
  /\bno\s+errors?\b/i,
  /\bwithout\s+errors?\b/i,
  /\b0\s+errors?\b/i,
  /\berrors?\s*:\s*0\b/i,
  /\bno\s+error\b/i,
  /\bno\s+issues\b/i,
  /\berror\s*:\s*none\b/i,
];

export const READY_PATTERNS = [
  /(^|\n)\s*(>|›|➜)\s*$/m,
  /\b(waiting for|ready for) your (input|prompt)\b/i,
  /\benter your prompt\b/i,
  /\btype your message\b/i,
  /\bmessage>\s*$/i,
];

export const ERROR_CLEAR_PATTERNS = [
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

export const TERMINAL_OPTIONS = {
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

export const TERMINAL_SEARCH_OPTIONS = {
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
