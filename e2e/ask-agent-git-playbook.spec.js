const path = require("path");
const fs = require("fs");
const { test, expect, _electron: electron } = require("@playwright/test");

test("user can inspect all Git playbooks and send Review Changes", async ({
}, testInfo) => {
  const rootDir = path.resolve(__dirname, "..");
  const appDataDir = testInfo.outputPath("appdata");
  fs.mkdirSync(appDataDir, { recursive: true });
  let electronApp = null;

  try {
    electronApp = await electron.launch({
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

    await expect(
      window.getByRole("button", { name: "Ask Agent" }),
    ).toBeDisabled();

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
    const firstSessionId = await window
      .locator(".session-tab.active")
      .getAttribute("data-session-id");
    await window.getByRole("button", { name: "Open fresh terminal" }).click();
    await expect(window.locator("#manual-terminal .xterm")).toBeVisible();

    const askAgentButton = window.getByRole("button", { name: "Ask Agent" });
    await expect(askAgentButton).toBeEnabled();
    await askAgentButton.click();
    for (const [playbookName, requiredGuidance] of [
      [
        "Commit Changes",
        [
          "staged, unstaged, and untracked",
          "coherent",
          "repository conventions",
          "proportionate",
          "Semantic",
          "stage the in-scope repair changes",
          "do not push it",
        ],
      ],
      [
        "Commit and Push",
        [
          "staged, unstaged, and untracked",
          "coherent",
          "stage the in-scope repair changes",
          "Never push known-bad work",
          "explicitly approves",
          "upstream",
          "remote state",
        ],
      ],
      [
        "Pull Safely",
        [
          "fetch",
          "ahead/behind",
          "complete the fast-forward and verify it",
          "commit, stash, or cancel",
          "merge or rebase",
        ],
      ],
      [
        "Create Branch",
        [
          "current HEAD",
          "naming conventions",
          "propose",
          "never stash, discard, or commit",
          "carry existing working-tree changes only when Git can do so safely",
        ],
      ],
      [
        "Diagnose Git Problem",
        [
          "evidence",
          "safe, reversible, and unambiguous",
          "locks",
          "hooks",
          "authentication",
          "explicit approval",
        ],
      ],
      [
        "Resolve Conflicts",
        [
          "merge, rebase, cherry-pick, revert",
          "mechanically clear",
          "ours or theirs",
          "abort",
          "stage",
          "Continue the active operation only when intent is clear",
          "validation passes",
        ],
      ],
    ]) {
      await window.getByRole("menuitem", { name: playbookName }).click();
      const playbookComposer = window.getByRole("dialog", {
        name: `${playbookName} playbook`,
      });
      await expect(playbookComposer).toBeVisible();
      const generatedPrompt = await playbookComposer
        .getByLabel("Prompt to send to agent")
        .inputValue();
      expect(generatedPrompt).toContain(rootDir);
      for (const guidance of requiredGuidance) {
        expect(generatedPrompt).toContain(guidance);
      }
      await playbookComposer.getByRole("button", { name: "Close" }).click();
      await askAgentButton.click();
    }
    await window.keyboard.press("Escape");
    await expect(window.getByRole("menu", { name: "Git playbooks" })).toBeHidden();
    await expect(askAgentButton).toBeFocused();

    await askAgentButton.click();
    await window.getByRole("menuitem", { name: "Review Changes" }).click();

    const composer = window.getByRole("dialog", {
      name: "Review Changes playbook",
    });
    await expect(composer).toBeVisible();
    const prompt = composer.getByLabel("Prompt to send to agent");
    const initialPrompt = await prompt.inputValue();
    expect(initialPrompt).toContain(rootDir);
    expect(initialPrompt).toContain("staged, unstaged, and untracked");
    expect(initialPrompt).toContain("Do not modify");

    await prompt.fill(`${await prompt.inputValue()}\nDISCARD_THIS_DRAFT`);
    await composer.getByRole("button", { name: "Close" }).click();
    await expect(composer).toBeHidden();
    await expect(askAgentButton).toBeFocused();

    await askAgentButton.click();
    await window.getByRole("menuitem", { name: "Review Changes" }).click();
    await expect(composer).toBeVisible();
    expect(await prompt.inputValue()).not.toContain("DISCARD_THIS_DRAFT");
    await expect(window.locator("#terminal")).not.toContainText(
      "DISCARD_THIS_DRAFT",
    );

    const marker = "Include the marker PLAYBOOK_SENT_ONCE in your report.";
    await prompt.fill(`${await prompt.inputValue()}\n${marker}`);
    await composer.getByRole("button", { name: "Copy" }).click();
    await expect
      .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain(marker);

    await composer.getByRole("button", { name: "Send to Agent" }).click();
    await expect(composer).toBeHidden();
    await expect(window.locator("#terminal .xterm-helper-textarea")).toBeFocused();
    await expect(window.locator("#terminal")).toContainText(
      "PLAYBOOK_SENT_ONCE",
      { timeout: 10_000 },
    );
    await expect(window.locator("#manual-terminal")).not.toContainText(
      "PLAYBOOK_SENT_ONCE",
    );

    await window.getByRole("button", { name: "Create session" }).click();
    await window.locator("#command").fill(
      process.platform === "win32" ? "cmd.exe" : process.env.SHELL || "sh",
    );
    await window.locator("#args").fill("");
    await window.locator("#cwd").fill(rootDir);
    await window
      .getByRole("button", { name: "Start Session" })
      .click({ noWaitAfter: true });
    await expect
      .poll(() =>
        window.locator(".session-tab.active").getAttribute("data-session-id"),
      )
      .not.toBe(firstSessionId);

    await askAgentButton.click();
    await window.getByRole("menuitem", { name: "Review Changes" }).click();
    await prompt.fill(`${await prompt.inputValue()}\nDO_NOT_SEND_ON_SWITCH`);
    await window
      .locator(`.session-tab[data-session-id="${firstSessionId}"]`)
      .click();
    await expect(composer).toBeHidden();
    await expect(window.locator("#terminal")).not.toContainText(
      "DO_NOT_SEND_ON_SWITCH",
    );

    await askAgentButton.click();
    await window.getByRole("menuitem", { name: "Review Changes" }).click();
    await expect(composer).toBeVisible();
    const failedPrompt = "  PRESERVE_THIS_EXACT_FAILED_PROMPT  \n";
    await prompt.fill(failedPrompt);

    await electronApp.evaluate(({ ipcMain }) => {
      globalThis.__gitPlaybookWrites = [];
      ipcMain.removeHandler("session:write");
      ipcMain.handle("session:write", async (_event, payload) => {
        globalThis.__gitPlaybookWrites.push(payload.input);
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw new Error("Simulated send failure");
      });
    });

    await window.locator("#git-playbook-send").evaluate((sendButton) => {
      sendButton.click();
      sendButton.click();
    });
    await expect(window.locator("#git-playbook-status")).toContainText(
      "Simulated send failure",
    );
    await expect(composer).toBeVisible();
    await expect(prompt).toHaveValue(failedPrompt);
    await expect(
      composer.getByRole("button", { name: "Send to Agent" }),
    ).toBeEnabled();
    await expect
      .poll(() =>
        electronApp.evaluate(() => globalThis.__gitPlaybookWrites),
      )
      .toEqual([`\u001b[200~  PRESERVE_THIS_EXACT_FAILED_PROMPT  \r\u001b[201~\r`]);

    await window.getByRole("button", { name: "Stop" }).click();
    await expect(askAgentButton).toBeDisabled();
    await expect(composer).toBeVisible();
    await expect(
      composer.getByRole("button", { name: "Send to Agent" }),
    ).toBeDisabled();
  } finally {
    await electronApp?.close();
  }
});
