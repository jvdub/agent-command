import { createTerminalClipboardController } from "../terminalClipboard.js";

async function flushAsyncHandlers() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createTarget({
  selection = "",
  kind = "agent",
  sessionId = "session-1",
  terminalId = "",
} = {}) {
  const mount = document.createElement("div");
  document.body.append(mount);
  const terminal = {
    attachCustomKeyEventHandler: jest.fn(),
    getSelection: jest.fn(() => selection),
    hasSelection: jest.fn(() => Boolean(selection)),
    onSelectionChange: jest.fn(),
    paste: jest.fn(),
  };

  return {
    kind,
    mount,
    sessionId,
    terminal,
    terminalId,
  };
}

describe("terminalClipboard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("Ctrl+C copies selected text instead of sending interrupt", async () => {
    const writeClipboardText = jest.fn();
    const sendInterrupt = jest.fn();
    const setStatus = jest.fn();
    const controller = createTerminalClipboardController({
      readClipboardText: jest.fn(),
      writeClipboardText,
      sendInterrupt,
      setStatus,
    });
    const target = createTarget({ selection: "selected text" });
    controller.attachToTarget(target);

    const keyHandler = target.terminal.attachCustomKeyEventHandler.mock.calls[0][0];
    const preventDefault = jest.fn();
    expect(
      keyHandler({
        type: "keydown",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "c",
        preventDefault,
      }),
    ).toBe(false);
    await flushAsyncHandlers();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(writeClipboardText).toHaveBeenCalledWith("selected text");
    expect(sendInterrupt).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith("Copied", "Terminal selection");
  });

  test("Ctrl+C sends interrupt when there is no live or preserved selection", async () => {
    const sendInterrupt = jest.fn();
    const controller = createTerminalClipboardController({
      readClipboardText: jest.fn(),
      writeClipboardText: jest.fn(),
      sendInterrupt,
      setStatus: jest.fn(),
    });
    const target = createTarget();
    controller.attachToTarget(target);

    const keyHandler = target.terminal.attachCustomKeyEventHandler.mock.calls[0][0];
    expect(
      keyHandler({
        type: "keydown",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "c",
        preventDefault: jest.fn(),
      }),
    ).toBe(false);
    await flushAsyncHandlers();

    expect(sendInterrupt).toHaveBeenCalledWith(target);
  });

  test("right-click opens app menu during capture and preserves selection", async () => {
    const writeClipboardText = jest.fn();
    const openContextMenu = jest.fn((event) => event.preventDefault());
    const controller = createTerminalClipboardController({
      readClipboardText: jest.fn(),
      writeClipboardText,
      sendInterrupt: jest.fn(),
      openContextMenu,
      setStatus: jest.fn(),
    });
    const target = createTarget();
    target.terminal.getSelection
      .mockReturnValueOnce("preserved text")
      .mockReturnValue("");
    controller.attachToTarget(target);

    target.terminal.onSelectionChange.mock.calls[0][0]();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    const stopPropagation = jest.spyOn(event, "stopPropagation");
    target.mount.dispatchEvent(event);

    expect(openContextMenu).toHaveBeenCalledWith(expect.any(MouseEvent), target);
    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalled();
    expect(await controller.copyTargetSelection(target)).toBe(true);
    expect(writeClipboardText).toHaveBeenCalledWith("preserved text");
  });

  test("plain left clicks do not poll terminal selection after mouseup", async () => {
    const controller = createTerminalClipboardController({
      readClipboardText: jest.fn(),
      writeClipboardText: jest.fn(),
      sendInterrupt: jest.fn(),
      setStatus: jest.fn(),
    });
    const target = createTarget({ selection: "link text" });
    controller.attachToTarget(target);

    target.mount.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 20,
    }));
    target.mount.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: 21,
      clientY: 21,
    }));
    await flushAsyncHandlers();

    expect(target.terminal.getSelection).not.toHaveBeenCalled();
  });

  test("Ctrl+C uses selection captured after a mouse drag when live selection later clears", async () => {
    const writeClipboardText = jest.fn();
    const sendInterrupt = jest.fn();
    const controller = createTerminalClipboardController({
      readClipboardText: jest.fn(),
      writeClipboardText,
      sendInterrupt,
      setStatus: jest.fn(),
    });
    const target = createTarget();
    target.terminal.getSelection
      .mockReturnValueOnce("drag selected text")
      .mockReturnValue("");
    controller.attachToTarget(target);

    target.mount.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    }));
    target.mount.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      clientX: 60,
      clientY: 10,
    }));
    await flushAsyncHandlers();

    const keyHandler = target.terminal.attachCustomKeyEventHandler.mock.calls[0][0];
    expect(
      keyHandler({
        type: "keydown",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "c",
        preventDefault: jest.fn(),
      }),
    ).toBe(false);
    await flushAsyncHandlers();

    expect(writeClipboardText).toHaveBeenCalledWith("drag selected text");
    expect(sendInterrupt).not.toHaveBeenCalled();
  });

  test("Ctrl+V pastes clipboard text into the terminal", async () => {
    const controller = createTerminalClipboardController({
      readClipboardText: jest.fn(async () => "paste me"),
      writeClipboardText: jest.fn(),
      sendInterrupt: jest.fn(),
      setStatus: jest.fn(),
    });
    const target = createTarget();
    controller.attachToTarget(target);

    const keyHandler = target.terminal.attachCustomKeyEventHandler.mock.calls[0][0];
    const preventDefault = jest.fn();
    expect(
      keyHandler({
        type: "keydown",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "v",
        preventDefault,
      }),
    ).toBe(false);
    await flushAsyncHandlers();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(target.terminal.paste).toHaveBeenCalledWith("paste me");
  });
});
