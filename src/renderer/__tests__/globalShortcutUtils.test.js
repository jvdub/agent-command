import {
  copyTerminalSelectionToClipboard,
  isShortcutKey,
  pasteClipboardIntoTerminal,
  writeTextToClipboard,
} from "../globalShortcutUtils.js";

describe("shared shortcut helpers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("isShortcutKey matches Ctrl/Cmd plus expected key", () => {
        expect(
      isShortcutKey(
        { ctrlKey: false, metaKey: true, altKey: false, key: "p" },
        "p",
      ),
    ).toBe(true);
  });

  test("copyTerminalSelectionToClipboard uses bridge fallback", async () => {
    const terminal = {
      getSelection: () => "selected text",
      hasSelection: () => true,
    };
    const bridgeWriteText = jest.fn();

    const copied = await copyTerminalSelectionToClipboard(terminal, {
      bridgeWriteText,
    });

    expect(copied).toBe(true);
    expect(bridgeWriteText).toHaveBeenCalledWith("selected text");
  });

  test("pasteClipboardIntoTerminal falls back to bridge read", async () => {
    const terminal = {
      paste: jest.fn(),
    };
    const bridgeReadText = jest.fn(async () => "paste me");

    const pasted = await pasteClipboardIntoTerminal(terminal, {
      bridgeReadText,
    });

    expect(pasted).toBe(true);
    expect(terminal.paste).toHaveBeenCalledWith("paste me");
  });

  test("writeTextToClipboard falls back to execCommand", async () => {
    const originalClipboard = navigator.clipboard;
    const originalExecCommand = document.execCommand;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn(async () => {
          throw new Error("clipboard denied");
        }),
      },
    });
    document.execCommand = jest.fn(() => true);

    const copied = await writeTextToClipboard("hello", () => {
      throw new Error("bridge failed");
    });

    expect(copied).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    document.execCommand = originalExecCommand;
  });
});
