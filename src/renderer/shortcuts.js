export const SHORTCUT_ACTIONS = Object.freeze({
  QUICK_OPEN: "quickOpen",
  FIND_IN_SESSION: "findInSession",
  SAVE_EDITOR: "saveEditor",
  TERMINAL_PASTE: "terminalPaste",
  ESCAPE: "escape",
});

function normalizeKey(event) {
  return String(event?.key || "").toLowerCase();
}

function isPrimaryModifierShortcut(event, key) {
  return (
    (event?.ctrlKey || event?.metaKey) &&
    !event?.altKey &&
    normalizeKey(event) === key
  );
}

export const SHORTCUT_REGISTRY = Object.freeze({
  [SHORTCUT_ACTIONS.QUICK_OPEN]: {
    matches: (event) => isPrimaryModifierShortcut(event, "p"),
  },
  [SHORTCUT_ACTIONS.FIND_IN_SESSION]: {
    matches: (event) => isPrimaryModifierShortcut(event, "f"),
    isEnabled: (context) => !context.editorOpen && Boolean(context.activeSessionId),
  },
  [SHORTCUT_ACTIONS.SAVE_EDITOR]: {
    matches: (event) => isPrimaryModifierShortcut(event, "s"),
    isEnabled: (context) => Boolean(context.editorOpen),
  },
  [SHORTCUT_ACTIONS.TERMINAL_PASTE]: {
    matches: (event) => isPrimaryModifierShortcut(event, "v"),
  },
  [SHORTCUT_ACTIONS.ESCAPE]: {
    matches: (event) => event?.key === "Escape",
  },
});

export function shouldRunShortcut(action, event, context = {}) {
  const definition = SHORTCUT_REGISTRY[action];
  if (!definition) {
    return false;
  }

  if (!definition.matches(event)) {
    return false;
  }

  if (typeof definition.isEnabled === "function") {
    return definition.isEnabled(context);
  }

  return true;
}

export function getMonacoKeybindingForAction(action, monacoApi) {
  if (!monacoApi) {
    return null;
  }

  if (action === SHORTCUT_ACTIONS.QUICK_OPEN) {
    return monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyP;
  }

  return null;
}
