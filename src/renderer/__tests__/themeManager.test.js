import {
  createThemeManager,
  getMonacoTheme,
  getTerminalTheme,
  THEME_STORAGE_KEY,
} from "../themeManager";

function createMediaQuery(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: jest.fn((_, listener) => listeners.add(listener)),
    removeEventListener: jest.fn((_, listener) => listeners.delete(listener)),
    setMatches(nextMatches) {
      this.matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches });
      }
    },
  };
}

describe("themeManager", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  test("defaults to and follows the system theme", () => {
    const mediaQuery = createMediaQuery(false);
    const onThemeApplied = jest.fn();
    const manager = createThemeManager({ mediaQuery, onThemeApplied });

    manager.initialize();
    expect(manager.getPreference()).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    mediaQuery.setMatches(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(onThemeApplied).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preference: "system",
        resolvedTheme: "dark",
        monacoTheme: "vs-dark",
        terminalTheme: getTerminalTheme("dark"),
      }),
    );
  });

  test("saves, restores, and applies a manual preference", () => {
    const select = document.createElement("select");
    select.innerHTML = '<option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>';
    const mediaQuery = createMediaQuery(false);
    const manager = createThemeManager({ mediaQuery, selectElement: select });
    manager.initialize();

    select.value = "dark";
    select.dispatchEvent(new Event("change"));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    mediaQuery.setMatches(false);
    expect(document.documentElement.dataset.theme).toBe("dark");

    const restored = createThemeManager({ mediaQuery });
    restored.initialize();
    expect(restored.getPreference()).toBe("dark");
    expect(restored.getResolvedTheme()).toBe("dark");
  });

  test("falls back to system for an invalid saved preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon");
    const manager = createThemeManager({ mediaQuery: createMediaQuery(true) });

    manager.initialize();

    expect(manager.getPreference()).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(getMonacoTheme("light")).toBe("vs");
  });
});
