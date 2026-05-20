function createWindowManager({ BrowserWindow, preloadPath, indexHtmlPath }) {
  let mainWindow = null;

  function hardenWebContents(webContents) {
    webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    webContents.on("will-navigate", (event) => {
      event.preventDefault();
    });

    webContents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 1080,
      minHeight: 760,
      backgroundColor: "#111111",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      },
    });

    hardenWebContents(mainWindow.webContents);

    mainWindow.loadFile(indexHtmlPath);

    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    return mainWindow;
  }

  function getMainWindow() {
    return mainWindow;
  }

  function sendToRenderer(channel, payload) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(channel, payload);
  }

  return {
    createWindow,
    getMainWindow,
    sendToRenderer,
  };
}

module.exports = {
  createWindowManager,
};
