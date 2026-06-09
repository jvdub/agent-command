export const THEME_STORAGE_KEY = "agentic-command-theme";
export const THEME_PREFERENCES = ["system", "light", "dark"];

const TERMINAL_THEMES = {
  dark: {
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
  light: {
    background: "#fbfaf7",
    foreground: "#25211d",
    cursor: "#c64f32",
    selectionBackground: "rgba(198, 79, 50, 0.22)",
    black: "#25211d",
    brightBlack: "#756e66",
    red: "#b83c32",
    green: "#39794f",
    yellow: "#9a6818",
    blue: "#286e9e",
    magenta: "#874d87",
    cyan: "#24777c",
    white: "#fbfaf7",
  },
};

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : "system";
}

export function resolveTheme(preference, mediaQuery) {
  const normalized = normalizeThemePreference(preference);
  if (normalized !== "system") {
    return normalized;
  }

  return mediaQuery?.matches ? "dark" : "light";
}

export function getTerminalTheme(resolvedTheme) {
  return TERMINAL_THEMES[resolvedTheme] || TERMINAL_THEMES.dark;
}

export function getMonacoTheme(resolvedTheme) {
  return resolvedTheme === "light" ? "vs" : "vs-dark";
}

export function createThemeManager({
  documentRef = document,
  storage = window.localStorage,
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)"),
  selectElement = null,
  onThemeApplied = () => {},
} = {}) {
  let preference = normalizeThemePreference(
    storage?.getItem(THEME_STORAGE_KEY),
  );
  let resolvedTheme = resolveTheme(preference, mediaQuery);

  function applyTheme() {
    resolvedTheme = resolveTheme(preference, mediaQuery);
    documentRef.documentElement.dataset.theme = resolvedTheme;
    documentRef.documentElement.style.colorScheme = resolvedTheme;

    if (selectElement) {
      selectElement.value = preference;
    }

    onThemeApplied({
      preference,
      resolvedTheme,
      terminalTheme: getTerminalTheme(resolvedTheme),
      monacoTheme: getMonacoTheme(resolvedTheme),
    });
  }

  function setPreference(nextPreference) {
    preference = normalizeThemePreference(nextPreference);
    storage?.setItem(THEME_STORAGE_KEY, preference);
    applyTheme();
  }

  function handleSystemThemeChange() {
    if (preference === "system") {
      applyTheme();
    }
  }

  function handleSelectionChange(event) {
    setPreference(event.target.value);
  }

  function initialize() {
    selectElement?.addEventListener("change", handleSelectionChange);
    mediaQuery?.addEventListener?.("change", handleSystemThemeChange);
    applyTheme();
  }

  function destroy() {
    selectElement?.removeEventListener("change", handleSelectionChange);
    mediaQuery?.removeEventListener?.("change", handleSystemThemeChange);
  }

  return {
    destroy,
    getPreference: () => preference,
    getResolvedTheme: () => resolvedTheme,
    initialize,
    setPreference,
  };
}
