const path = require("path");
const { _electron: electron } = require("@playwright/test");

const rootDir = path.resolve(__dirname, "..", "..");

async function launchElectronApp(testInfo, name = "appdata") {
  const appDataDir = testInfo.outputPath(name);
  const electronApp = await electron.launch({
    args: [
      "--disable-gpu",
      "--no-sandbox",
      `--user-data-dir=${appDataDir}`,
      rootDir,
    ],
    cwd: rootDir,
    env: {
      ...process.env,
      APPDATA: appDataDir,
      LOCALAPPDATA: appDataDir,
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  // Electron can expose the first renderer just before Playwright's main-process
  // execution context finishes settling after app-ready startup work.
  await window.waitForTimeout(100);
  return { appDataDir, electronApp, rootDir, window };
}

async function startShellSession(window, options = {}) {
  const label = options.label || "E2E session";
  const cwd = options.cwd || rootDir;

  await window.getByRole("button", { name: "Create session" }).click();
  await window.locator("#label").fill(label);
  await window.locator("#command").fill(
    process.platform === "win32" ? "cmd.exe" : process.env.SHELL || "sh",
  );
  await window.locator("#args").fill(
    process.platform === "win32" ? "/d /q" : "",
  );
  await window.locator("#cwd").fill(cwd);
  await window.getByRole("button", { name: "Start Session" }).click();
  await window.locator("#terminal-view").waitFor({ state: "visible" });
}

async function writeTerminalCommand(window, selector, command, marker) {
  await window.locator(selector).click();
  await window.keyboard.type(command);
  await window.keyboard.press("Enter");
  await window.waitForFunction(
    ({ selector: targetSelector, marker: targetMarker }) =>
      document.querySelector(targetSelector)?.textContent?.includes(targetMarker),
    { selector, marker },
  );
}

module.exports = {
  launchElectronApp,
  rootDir,
  startShellSession,
  writeTerminalCommand,
};
