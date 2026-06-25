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
  const deferredSnapshotTimers = new WeakMap();
  const dragSnapshotThreshold = 3;

  function writeToClipboard(value) {
    return writeClipboardText(value);
  }

  async function copyTargetSelection(target) {
    if (!target?.terminal) {
      return false;
    }

    snapshotSelection(target);
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

  function scheduleSnapshotSelection(target) {
    const existingTimer = deferredSnapshotTimers.get(target);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      deferredSnapshotTimers.delete(target);
      snapshotSelection(target);
    }, 0);
    deferredSnapshotTimers.set(target, timer);
  }

  function getPointerPoint(event) {
    return {
      x: Number.isFinite(event.clientX) ? event.clientX : 0,
      y: Number.isFinite(event.clientY) ? event.clientY : 0,
    };
  }

  function shouldSnapshotAfterDrag(startPoint, endPoint) {
    if (!startPoint) {
      return false;
    }

    return (
      Math.abs(endPoint.x - startPoint.x) >= dragSnapshotThreshold ||
      Math.abs(endPoint.y - startPoint.y) >= dragSnapshotThreshold
    );
  }

  function attachToTarget(target, { onKeyDown = null } = {}) {
    const { terminal, mount } = target;
    const ownerDocument = mount.ownerDocument || document;
    let selectionDragStart = null;

    terminal.onSelectionChange?.(() => {
      snapshotSelection(target);
    });

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") {
        return true;
      }

      if (isShortcutKey(event, "c")) {
        event.preventDefault();
        snapshotSelection(target);
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

    mount.addEventListener(
      "mousedown",
      (event) => {
        if (event.button === 0) {
          selectionDragStart = getPointerPoint(event);
          return;
        }

        if (event.button === 2) {
          snapshotSelection(target);
          if (typeof openContextMenu === "function") {
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(event, target);
          }
        }
      },
      true,
    );

    mount.addEventListener("contextmenu", (event) => {
      if (typeof openContextMenu === "function") {
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(event, target);
      }
    }, true);

    function snapshotIfSelectionDrag(event) {
      const endPoint = getPointerPoint(event);
      const shouldSnapshot = shouldSnapshotAfterDrag(
        selectionDragStart,
        endPoint,
      );
      selectionDragStart = null;

      if (shouldSnapshot) {
        scheduleSnapshotSelection(target);
      }
    }

    mount.addEventListener("mouseup", snapshotIfSelectionDrag);

    ownerDocument.addEventListener("mouseup", snapshotIfSelectionDrag);
  }

  return {
    attachToTarget,
    copyTargetSelection,
    pasteIntoTerminal,
    snapshotSelection,
  };
}
