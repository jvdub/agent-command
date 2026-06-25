import {
  copyTerminalSelectionToClipboard,
  getTerminalSelectionText,
  isShortcutKey,
  pasteClipboardIntoTerminal,
  preserveTerminalSelection,
  writeTextToClipboard,
} from "./globalShortcutUtils.js";

export function createTerminalClipboardController({
  readClipboardText,
  writeClipboardText,
  sendInterrupt,
  openContextMenu = null,
  setStatus = null,
}) {
  function writeToClipboard(value) {
    return writeClipboardText(value);
  }

  async function copyTargetSelection(target) {
    if (!target?.terminal) {
      return false;
    }

    const copied = await copyTerminalSelectionToClipboard(target.terminal, {
      mount: target.mount || null,
      fallbackSelection: target.selectionSnapshot || "",
      bridgeWriteText: writeToClipboard,
    });

    if (copied) {
      setStatus?.("Copied", "Terminal selection");
    }

    return copied;
  }

  async function pasteIntoTerminal(terminal) {
    return pasteClipboardIntoTerminal(terminal, {
      bridgeReadText: readClipboardText,
    });
  }

  function snapshotSelection(target) {
    if (!target?.terminal) {
      return "";
    }

    return preserveTerminalSelection(
      target,
      target.terminal,
      target.mount || null,
    );
  }

  function attachToTarget(target, { onKeyDown = null } = {}) {
    const { terminal, mount } = target;

    terminal.onSelectionChange?.(() => {
      snapshotSelection(target);
    });

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      if (isShortcutKey(event, "c")) {
        event.preventDefault();
        copyTargetSelection(target)
          .then((copied) => {
            if (copied) {
              return;
            }

            return sendInterrupt?.(target);
          })
          .catch((error) => {
            setStatus?.(
              "Error",
              error?.message || "Unable to process Ctrl+C shortcut",
            );
          });
        return false;
      }

      if (isShortcutKey(event, "v")) {
        event.preventDefault();
        pasteIntoTerminal(terminal);
        return false;
      }

      if (typeof onKeyDown === "function") {
        return onKeyDown(event);
      }

      return true;
    });

    mount.addEventListener("copy", (event) => {
      const selection = getTerminalSelectionText(terminal, mount);
      if (!selection) {
        return;
      }

      if (event.clipboardData?.setData) {
        event.preventDefault();
        event.clipboardData.setData("text/plain", selection);
        return;
      }

      writeTextToClipboard(selection, writeToClipboard);
    });

    mount.addEventListener("paste", (event) => {
      const text = event.clipboardData?.getData("text");
      if (!text) {
        return;
      }

      event.preventDefault();
      terminal.paste(text);
    });

    if (typeof openContextMenu === "function") {
      mount.addEventListener("contextmenu", (event) => {
        openContextMenu(event, target);
      });
    }

    mount.addEventListener("mousedown", (event) => {
      if (event.button === 2) {
        snapshotSelection(target);
      }
    });
  }

  return {
    attachToTarget,
    copyTargetSelection,
    pasteIntoTerminal,
    snapshotSelection,
  };
}
