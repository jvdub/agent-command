export function isShortcutKey(event, key) {
  const pressedKey = String(event?.key || "").toLowerCase();
  return (
    (event?.ctrlKey || event?.metaKey) && !event?.altKey && pressedKey === key
  );
}

function getDomSelectionTextWithinMount(mount) {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return "";
  }

  const text = String(selection);
  if (!text) {
    return "";
  }

  if (!mount) {
    return text;
  }

  const range = selection.getRangeAt(0);
  const startInside = mount.contains(range.startContainer);
  const endInside = mount.contains(range.endContainer);
  return startInside || endInside ? text : "";
}

export function getTerminalSelectionText(terminal, mount = null) {
  const xtermSelection =
    typeof terminal?.getSelection === "function" ? terminal.getSelection() : "";
  if (xtermSelection) {
    return xtermSelection;
  }

  return getDomSelectionTextWithinMount(mount);
}

export function hasTerminalSelection(terminal, mount = null) {
  if (typeof terminal?.hasSelection === "function" && terminal.hasSelection()) {
    return true;
  }

  return Boolean(getTerminalSelectionText(terminal, mount));
}

function writeTextViaExecCommand(value) {
  if (!document?.body || typeof document.execCommand !== "function") {
    return false;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "readonly");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.append(textArea);
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  textArea.remove();
  return copied;
}

export async function writeTextToClipboard(value, bridgeWriteText = null) {
  if (!value) {
    return false;
  }

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to bridge write.
    }
  }

  if (typeof bridgeWriteText === "function") {
    try {
      bridgeWriteText(value);
      return true;
    } catch {
      // Fall through to execCommand fallback.
    }
  }

  return writeTextViaExecCommand(value);
}

export async function readTextFromClipboard(bridgeReadText = null) {
  if (navigator?.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        return text;
      }
    } catch {
      // Fall through to bridge read.
    }
  }

  if (typeof bridgeReadText === "function") {
    try {
      return (await bridgeReadText()) || "";
    } catch {
      return "";
    }
  }

  return "";
}

export async function copyTerminalSelectionToClipboard(
  terminal,
  { mount = null, fallbackSelection = "", bridgeWriteText = null } = {},
) {
  const selection = getTerminalSelectionText(terminal, mount);
  const resolvedSelection = selection || fallbackSelection;
  if (!resolvedSelection) {
    return false;
  }

  return writeTextToClipboard(resolvedSelection, bridgeWriteText);
}

export async function pasteClipboardIntoTerminal(
  terminal,
  { bridgeReadText = null } = {},
) {
  const text = await readTextFromClipboard(bridgeReadText);
  if (!text) {
    return false;
  }

  terminal.paste(text);
  return true;
}
