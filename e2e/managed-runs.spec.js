const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { launchElectronApp, rootDir } = require("./helpers/electronApp");

test("managed runs require an explicitly approved structured plan", async ({}, testInfo) => {
  const { electronApp, window } = await launchElectronApp(
    testInfo,
    "managed-run-appdata",
  );

  try {
    await window.getByRole("button", { name: "Create managed run" }).click();
    await window.locator("#managed-run-title-input").fill("Managed E2E run");
    await window.locator("#managed-run-repo-input").fill(rootDir);
    await window
      .locator("#managed-run-spec-input")
      .fill("Implement a focused test-only behavior through a managed run.");
    await window.locator("#new-managed-run-popover summary").click();
    await window.locator("#managed-run-implementation-model").fill("codex-special");
    await window.locator("#managed-run-form button[type='submit']").click();

    await expect(window.locator("#managed-run-view")).toBeVisible();
    await expect(window.locator("#managed-run-view-title")).toHaveText(
      "Managed E2E run",
    );
    // The periodic PTY refresh must not replace an active Managed Run view.
    await window.waitForTimeout(3_200);
    await expect(window.locator("#managed-run-view")).toBeVisible();
    await expect(window.locator("#managed-run-view-title")).toHaveText(
      "Managed E2E run",
    );
    await expect(window.locator("#managed-run-start")).toBeDisabled();
    await expect(window.locator("#managed-run-routing-implementer-model")).toHaveValue(
      "codex-special",
    );

    const plan = {
      objective: "Exercise the managed workflow",
      constraints: ["Do not modify production files"],
      nonGoals: [],
      successCriteria: ["The plan is explicitly approved"],
      risks: [],
      unresolvedQuestions: [],
      finalVerificationGuidance: ["Inspect the complete diff"],
      tasks: [
        {
          id: "task-1",
          title: "Focused task",
          objective: "Make one bounded change",
          successCriteria: ["Focused check passes"],
          dependencies: [],
          relevantScope: ["src"],
          implementationTier: "standard",
          verificationTier: "standard",
          verificationGuidance: ["Run focused tests"],
          contextNotes: [],
          maxAttempts: 3,
        },
      ],
    };
    await window.locator("#managed-run-plan-editor").fill(`
# Objective

${plan.objective}

# Success criteria

- ${plan.successCriteria[0]}

# Tasks

## Task \`${plan.tasks[0].id}\`: ${plan.tasks[0].title}

### Objective

${plan.tasks[0].objective}

### Success criteria

- ${plan.tasks[0].successCriteria[0]}

### Maximum attempts

${plan.tasks[0].maxAttempts}
`);
    await window.locator("#managed-run-save-plan").click();
    await expect(window.locator("#managed-run-plan-meta")).toContainText(
      "approval required",
    );
    await expect(window.locator("#managed-run-start")).toBeDisabled();

    await window.locator("#managed-run-approve-plan").click();
    await expect(window.locator("#managed-run-plan-meta")).toContainText(
      "approved",
    );
    await expect(window.locator("#managed-run-start")).toBeEnabled();
    await expect(window.locator("#managed-run-journey")).toContainText(
      "Focused task",
    );
    await expect(window.locator("#managed-run-current-action")).toContainText(
      "task-1",
    );
    await window.locator('[data-task-id="task-1"]').click();
    await expect(window.locator("#managed-run-inspector")).toContainText(
      "Approved task definition",
    );
    await expect(window.locator("#managed-run-inspector")).toContainText(
      "Make one bounded change",
    );
    await expect(window.locator("#managed-run-inbox-list")).toContainText(
      "Nothing needs your attention",
    );
    await window.screenshot({
      path: testInfo.outputPath("managed-run-journey.png"),
    });
    await window.locator("#theme-select").selectOption("dark");
    await window.setViewportSize({ width: 900, height: 720 });
    await expect(window.locator(".managed-run-workspace")).toBeVisible();
    await expect(window.locator("#managed-run-inspector")).toBeVisible();
    await expect(window.locator("#managed-run-journey")).toHaveCSS(
      "flex-direction",
      "column",
    );
    await window.screenshot({
      path: testInfo.outputPath("managed-run-journey-dark-narrow.png"),
    });
  } finally {
    await electronApp.close();
  }
});

test("managed runs can initialize an empty target after explicit confirmation", async ({}, testInfo) => {
  const emptyTarget = testInfo.outputPath("empty-managed-target");
  const cancelledTarget = testInfo.outputPath("cancelled-managed-target");
  fs.mkdirSync(emptyTarget, { recursive: true });
  fs.mkdirSync(cancelledTarget, { recursive: true });
  const { electronApp, window } = await launchElectronApp(
    testInfo,
    "managed-run-empty-appdata",
  );

  try {
    await window.getByRole("button", { name: "Create managed run" }).click();
    await window.locator("#managed-run-title-input").fill("New repository run");
    await window.locator("#managed-run-repo-input").fill(cancelledTarget);
    await window
      .locator("#managed-run-spec-input")
      .fill("Create the initial project structure.");
    window.once("dialog", (dialog) => dialog.dismiss());
    await window.locator("#managed-run-form button[type='submit']").click();
    expect(fs.existsSync(path.join(cancelledTarget, ".git"))).toBe(false);

    await window.locator("#managed-run-repo-input").fill(emptyTarget);
    window.once("dialog", (dialog) => dialog.accept());
    await window.locator("#managed-run-form button[type='submit']").click();

    await expect(window.locator("#managed-run-view")).toBeVisible();
    expect(fs.existsSync(path.join(emptyTarget, ".git"))).toBe(true);
  } finally {
    await electronApp.close();
  }
});
