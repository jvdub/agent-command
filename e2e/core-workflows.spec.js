const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const {
  launchElectronApp,
  startShellSession,
  writeTerminalCommand,
} = require("./helpers/electronApp");

async function reportTerminalSize(window, label) {
  await writeTerminalCommand(
    window,
    "#terminal",
    `node -e "console.log('${label}='+process.stdout.columns+'x'+process.stdout.rows)"`,
    `${label}=`,
  );

  let reportedSize = "";
  await expect
    .poll(async () => {
      const terminalText = await window.locator("#terminal").textContent();
      reportedSize =
        terminalText?.match(new RegExp(`${label}=(\\d+x\\d+)`))?.[1] || "";
      return reportedSize;
    })
    .toMatch(/^\d+x\d+$/);

  return reportedSize;
}

test("agent and manual terminals accept interactive shell input", async ({}, testInfo) => {
  const { electronApp, window } = await launchElectronApp(testInfo);

  try {
    await startShellSession(window, { label: "Terminal roundtrip" });
    await writeTerminalCommand(
      window,
      "#terminal",
      "echo AGENT_TERMINAL_E2E",
      "AGENT_TERMINAL_E2E",
    );

    await window.locator("#add-manual-terminal").click();
    await writeTerminalCommand(
      window,
      "#manual-terminal",
      "echo MANUAL_TERMINAL_E2E",
      "MANUAL_TERMINAL_E2E",
    );

    await window.getByRole("button", { name: "Stop" }).click();
    await expect(window.locator("#session-status")).toHaveText("Stopped");
  } finally {
    await electronApp.close();
  }
});

test("quick open loads a workspace file and theme choices remain selectable", async ({}, testInfo) => {
  const { electronApp, window } = await launchElectronApp(testInfo);

  try {
    await startShellSession(window, { label: "Workspace tools" });
    await window.keyboard.press("Control+p");
    await expect(window.locator("#quick-open-overlay")).toBeVisible();
    await window.locator("#quick-open-input").fill("README.md");
    await window.locator(".quick-open-result").first().click();
    await expect(window.locator("#file-drawer")).toBeVisible();
    await expect(window.locator("#file-editor-path")).toHaveText("README.md");

    for (const mode of ["light", "dark", "system"]) {
      await window.locator("#theme-select").selectOption(mode);
      await expect(window.locator("#theme-select")).toHaveValue(mode);
    }
  } finally {
    await electronApp.close();
  }
});

test("stopped sessions restart and their metadata survives relaunch", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const firstLaunch = await launchElectronApp(testInfo, "persistent-appdata");
  const historyProtectionAvailable = await firstLaunch.electronApp.evaluate(
    ({ safeStorage }) => {
      if (!safeStorage.isEncryptionAvailable()) {
        return false;
      }

      if (process.platform !== "linux") {
        return true;
      }

      const backend = safeStorage.getSelectedStorageBackend();
      return !["basic_text", "unknown"].includes(backend);
    },
  );

  try {
    await startShellSession(firstLaunch.window, { label: "Persistent session" });
    const sizeBeforeRestart = await reportTerminalSize(
      firstLaunch.window,
      "SIZE_BEFORE_RESTART",
    );
    await firstLaunch.window.getByRole("button", { name: "Stop" }).click();
    await expect(firstLaunch.window.locator("#session-status")).toHaveText("Stopped");
    await firstLaunch.window.locator(".session-action-restart").first().click();
    await expect(firstLaunch.window.locator("#session-status")).toHaveText("Running");
    const sizeAfterRestart = await reportTerminalSize(
      firstLaunch.window,
      "SIZE_AFTER_RESTART",
    );
    expect(sizeAfterRestart).toBe(sizeBeforeRestart);
    await writeTerminalCommand(
      firstLaunch.window,
      "#terminal",
      "echo PERSISTED_TERMINAL_HISTORY",
      "PERSISTED_TERMINAL_HISTORY",
    );
    await firstLaunch.window.getByRole("button", { name: "Stop" }).click();
    await expect(firstLaunch.window.locator("#session-status")).toHaveText("Stopped");
    await expect(firstLaunch.window.locator(".session-tab.stopped-tab")).toBeVisible();
  } finally {
    await firstLaunch.electronApp.close();
  }

  const secondLaunch = await launchElectronApp(testInfo, "persistent-appdata");
  try {
    const restoredSession = secondLaunch.window.locator(".session-tab").first();
    await expect(restoredSession).toContainText("Persistent session");
    await restoredSession.click();
    if (historyProtectionAvailable) {
      await expect(secondLaunch.window.locator("#terminal")).toContainText(
        "PERSISTED_TERMINAL_HISTORY",
      );
    } else {
      await expect(secondLaunch.window.locator("#terminal")).not.toContainText(
        "PERSISTED_TERMINAL_HISTORY",
      );
    }
  } finally {
    await secondLaunch.electronApp.close();
  }
});

test("failed commands report the process exit instead of a resize race", async ({}, testInfo) => {
  const { electronApp, rootDir, window } = await launchElectronApp(testInfo);

  try {
    await window.getByRole("button", { name: "Create session" }).click();
    const isWindows = process.platform === "win32";
    await window.locator("#command").fill(
      isWindows ? "definitely-not-a-real-command-e2e" : "/bin/sh",
    );
    await window.locator("#args").fill(isWindows ? "" : '-c "exit 7"');
    await window.locator("#cwd").fill(rootDir);
    await window.getByRole("button", { name: "Start Session" }).click();

    await expect(window.locator("#session-status")).toHaveText("Error");
    await expect(window.locator("#session-meta")).toContainText(
      `Session exited with code ${isWindows ? 1 : 7}`,
    );
    await expect(window.locator("#session-meta")).not.toContainText(
      "Cannot resize a pty",
    );
  } finally {
    await electronApp.close();
  }
});

test("workspace files can be edited and saved from the drawer", async ({}, testInfo) => {
  const fixtureName = `editable-fixture-${testInfo.workerIndex}.txt`;
  const fixturePath = path.join(__dirname, fixtureName);
  fs.writeFileSync(fixturePath, "before edit", "utf8");
  const { electronApp, window } = await launchElectronApp(testInfo);

  try {
    await startShellSession(window, { label: "File editor" });
    await window.keyboard.press("Control+p");
    await window.locator("#quick-open-input").fill(fixtureName);
    await window.locator(".quick-open-result").first().click();
    await expect(window.locator("#file-editor-path")).toContainText(fixtureName);

    const editorInput = window.locator(
      "#file-editor-surface .monaco-editor textarea.inputarea",
    );
    await editorInput.waitFor({ state: "attached" });
    await editorInput.evaluate((element) => element.focus());
    await window.keyboard.press("Control+a");
    await window.keyboard.type("after edit");
    await window.locator("#file-editor-save").click();
    await expect.poll(() => fs.readFileSync(fixturePath, "utf8")).toBe("after edit");
  } finally {
    await electronApp.close();
    fs.rmSync(fixturePath, { force: true });
  }
});

test("removing a stopped session clears it from persisted history", async ({}, testInfo) => {
  test.setTimeout(60_000);
  const firstLaunch = await launchElectronApp(testInfo, "removed-session-appdata");

  try {
    await startShellSession(firstLaunch.window, { label: "Remove me" });
    await firstLaunch.window.getByRole("button", { name: "Stop" }).click();
    await expect(firstLaunch.window.locator("#session-status")).toHaveText("Stopped");
    await firstLaunch.window.locator(".session-action-remove").first().click();
    await expect(firstLaunch.window.locator("#session-tabs-list")).toContainText("No sessions");
  } finally {
    await firstLaunch.electronApp.close();
  }

  const secondLaunch = await launchElectronApp(testInfo, "removed-session-appdata");
  try {
    await expect(secondLaunch.window.locator("#session-tabs-list")).toContainText(
      "No sessions",
    );
  } finally {
    await secondLaunch.electronApp.close();
  }
});

test("switching sessions focuses input on the selected agent terminal", async ({}, testInfo) => {
  const { electronApp, window } = await launchElectronApp(testInfo);

  try {
    await startShellSession(window, { label: "First focus session" });
    await startShellSession(window, { label: "Second focus session" });

    const firstSession = window
      .locator(".session-tab")
      .filter({ hasText: "First focus session" });
    await firstSession.click();

    await expect(window.locator("#terminal-title")).toHaveText(
      "First focus session",
    );
    const selectedTerminalInput = window.locator(
      "#terminal .terminal-instance:not(.hidden) .xterm-helper-textarea",
    );
    await expect(selectedTerminalInput).toBeFocused();

    await window.keyboard.type("echo SELECTED_SESSION_INPUT_E2E");
    await window.keyboard.press("Enter");
    await expect(
      window.locator("#terminal .terminal-instance:not(.hidden)"),
    ).toContainText("SELECTED_SESSION_INPUT_E2E");
  } finally {
    await electronApp.close();
  }
});

test("sessions can be renamed inline and retain the name after relaunch", async ({}, testInfo) => {
  const firstLaunch = await launchElectronApp(testInfo, "renamed-session-appdata");

  try {
    await startShellSession(firstLaunch.window, { label: "Rename me" });
    const sessionTab = firstLaunch.window
      .locator(".session-tab")
      .filter({ hasText: "Rename me" });
    await sessionTab.hover();

    const renameButton = firstLaunch.window.getByRole("button", {
      name: "Rename Rename me",
    });
    await expect(renameButton).toHaveCSS("opacity", "1");
    await renameButton.click();

    const renameInput = firstLaunch.window.getByRole("textbox", {
      name: "Session name",
    });
    await expect(renameInput).toBeFocused();
    await renameInput.fill("Renamed E2E session");
    await renameInput.press("Enter");

    await expect(firstLaunch.window.locator(".session-tab")).toContainText(
      "Renamed E2E session",
    );
    await expect(firstLaunch.window.locator("#terminal-title")).toHaveText(
      "Renamed E2E session",
    );

    await firstLaunch.window.getByRole("button", { name: "Stop" }).click();
    await expect(firstLaunch.window.locator(".session-tab.stopped-tab")).toBeVisible();
  } finally {
    await firstLaunch.electronApp.close();
  }

  const secondLaunch = await launchElectronApp(testInfo, "renamed-session-appdata");
  try {
    await expect(secondLaunch.window.locator(".session-tab")).toContainText(
      "Renamed E2E session",
    );
  } finally {
    await secondLaunch.electronApp.close();
  }
});

test("operational tools expose CLI readiness, diagnostics, and history clearing", async ({}, testInfo) => {
  const { electronApp, window } = await launchElectronApp(testInfo);

  try {
    await startShellSession(window, { label: "History to clear" });
    await window.getByRole("button", { name: "Stop" }).click();
    await expect(window.locator("#session-status")).toHaveText("Stopped");

    await window.getByRole("button", { name: "Create session" }).click();
    await window.locator("#command").fill("definitely-not-installed-agent-cli");
    await expect(window.locator("#command-readiness")).toContainText(
      "was not found in PATH",
    );

    await window.locator("#copy-diagnostics").click();
    await expect(window.locator("#session-status")).toHaveText("Copied");

    window.once("dialog", (dialog) => dialog.accept());
    await window.locator("#clear-history").click();
    await expect(window.locator("#session-tabs-list")).toContainText("No sessions");
    await expect(window.locator("#session-status")).toHaveText(
      "History cleared",
    );
  } finally {
    await electronApp.close();
  }
});
