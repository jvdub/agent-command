/** @jest-environment node */

const { createWindowManager } = require("../window");

describe("createWindowManager", () => {
  test("creates a hardened BrowserWindow configuration", () => {
    const setWindowOpenHandler = jest.fn();
    const onWebContents = jest.fn();
    const sendWebContents = jest.fn();
    const onWindow = jest.fn();
    const loadFile = jest.fn();

    class MockBrowserWindow {
      constructor(options) {
        this.options = options;
        this.webContents = {
          setWindowOpenHandler,
          on: onWebContents,
          send: sendWebContents,
        };
      }

      on(eventName, handler) {
        onWindow(eventName, handler);
      }

      loadFile(filePath) {
        loadFile(filePath);
      }

      isDestroyed() {
        return false;
      }
    }

    const manager = createWindowManager({
      BrowserWindow: MockBrowserWindow,
      preloadPath: "/tmp/preload.js",
      indexHtmlPath: "/tmp/index.html",
    });

    const win = manager.createWindow();

    expect(win.options.webPreferences.contextIsolation).toBe(true);
    expect(win.options.webPreferences.nodeIntegration).toBe(false);
    expect(win.options.webPreferences.sandbox).toBe(true);
    expect(win.options.webPreferences.webSecurity).toBe(true);
    expect(win.options.webPreferences.allowRunningInsecureContent).toBe(false);
    expect(win.options.webPreferences.webviewTag).toBe(false);

    expect(setWindowOpenHandler).toHaveBeenCalledTimes(1);
    expect(onWebContents).toHaveBeenCalledWith(
      "will-navigate",
      expect.any(Function),
    );
    expect(onWebContents).toHaveBeenCalledWith(
      "will-attach-webview",
      expect.any(Function),
    );
    expect(loadFile).toHaveBeenCalledWith("/tmp/index.html");
    expect(onWindow).toHaveBeenCalledWith("closed", expect.any(Function));

    manager.sendToRenderer("sessions:changed", { value: 1 });
    expect(sendWebContents).toHaveBeenCalledWith("sessions:changed", {
      value: 1,
    });
    expect(() =>
      manager.sendToRenderer("sessions:changed", { value: 2 }),
    ).not.toThrow();
  });
});
