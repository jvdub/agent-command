const path = require("path");
const fs = require("fs");
const { test, expect, _electron: electron } = require("@playwright/test");

test("clicking a modified file opens visible content in the file drawer", async ({
}, testInfo) => {
  const rootDir = path.resolve(__dirname, "..");
  const appDataDir = testInfo.outputPath("appdata");
  fs.mkdirSync(appDataDir, { recursive: true });
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

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await window
      .getByRole("button", { name: "Create session" })
      .click({ noWaitAfter: true });
    await window.locator("#command").fill(
      process.platform === "win32" ? "cmd.exe" : process.env.SHELL || "sh",
    );
    await window.locator("#args").fill("");
    await window.locator("#cwd").fill(rootDir);
    await window
      .getByRole("button", { name: "Start Session" })
      .click({ noWaitAfter: true });
    await expect(window.locator("#terminal-view")).toBeVisible();

    const modifiedFile = window.locator(
      '.modified-file-button[data-file-path="src/renderer/index.html"]',
    );
    await expect(modifiedFile).toBeVisible();
    await modifiedFile.click();

    await expect(window.locator("#file-drawer")).toBeVisible({
      timeout: 20_000,
    });
    await expect(window.locator("#file-editor-path")).toHaveText(
      /src[\\/]renderer[\\/]index\.html/,
    );
    const visibleFileContent = window.locator(
      "#file-editor-surface .monaco-editor:visible, #file-editor-preview:visible",
    );
    await expect(visibleFileContent).toBeVisible();
    await expect(visibleFileContent).toContainText("<!doctype html>");

    await window.getByRole("button", { name: "Stop" }).click();
  } finally {
    await electronApp.close();
  }
});
