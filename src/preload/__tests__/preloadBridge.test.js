/** @jest-environment node */

describe("preload bridge", () => {
  test("exposes modular agentic API wired to IPC channels", async () => {
    jest.resetModules();

    const exposeInMainWorld = jest.fn();
    const invoke = jest.fn(async () => ({ ok: true }));
    const on = jest.fn();
    const removeListener = jest.fn();
    const readText = jest.fn(() => "clip");
    const writeText = jest.fn();

    jest.doMock("electron", () => ({
      clipboard: {
        readText,
        writeText,
      },
      contextBridge: {
        exposeInMainWorld,
      },
      ipcRenderer: {
        invoke,
        on,
        removeListener,
      },
    }));

    require("../../preload.js");

    const exposed = Object.fromEntries(
      exposeInMainWorld.mock.calls.map(([key, value]) => [key, value]),
    );

    expect(exposed.agentic).toBeDefined();
    expect(exposed.agenticApp).toBeUndefined();

    await exposed.agentic.sessions.write("session-1", "pwd\r");
    expect(invoke).toHaveBeenCalledWith("session:write", {
      sessionId: "session-1",
      input: "pwd\r",
    });

    await exposed.agentic.workspace.openFile("session-1", "src/main.js");
    expect(invoke).toHaveBeenCalledWith("editor:openFile", {
      sessionId: "session-1",
      filePath: "src/main.js",
    });

    const fileChangedListener = jest.fn();
    const unsubscribeFileChanged =
      exposed.agentic.workspace.onFileChanged(fileChangedListener);
    expect(on).toHaveBeenCalledWith(
      "workspace:file-changed",
      expect.any(Function),
    );
    unsubscribeFileChanged();
    expect(removeListener).toHaveBeenCalledWith(
      "workspace:file-changed",
      expect.any(Function),
    );

    await exposed.agentic.manualTerminals.resize(
      "session-1",
      { cols: 120, rows: 36 },
      "2",
    );
    expect(invoke).toHaveBeenCalledWith("manual-terminal:resize", {
      sessionId: "session-1",
      terminalId: "2",
      cols: 120,
      rows: 36,
    });

    await expect(exposed.agentic.clipboard.readText()).resolves.toBe("clip");
    await exposed.agentic.clipboard.writeText("new-value");
    expect(writeText).toHaveBeenCalledWith("new-value");

    const listener = jest.fn();
    const unsubscribe = exposed.agentic.sessions.onData(listener);
    expect(on).toHaveBeenCalledWith("session:data", expect.any(Function));
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(
      "session:data",
      expect.any(Function),
    );

    const shortcutListener = jest.fn();
    const unsubscribeQuickOpen =
      exposed.agentic.shortcuts.onQuickOpen(shortcutListener);
    expect(on).toHaveBeenCalledWith(
      "app:shortcut:quick-open",
      expect.any(Function),
    );
    unsubscribeQuickOpen();
    expect(removeListener).toHaveBeenCalledWith(
      "app:shortcut:quick-open",
      expect.any(Function),
    );

    const copyShortcutListener = jest.fn();
    const unsubscribeCopyOrInterrupt =
      exposed.agentic.shortcuts.onCopyOrInterrupt(copyShortcutListener);
    expect(on).toHaveBeenCalledWith(
      "app:shortcut:copy-or-interrupt",
      expect.any(Function),
    );
    unsubscribeCopyOrInterrupt();
    expect(removeListener).toHaveBeenCalledWith(
      "app:shortcut:copy-or-interrupt",
      expect.any(Function),
    );
  });
});
