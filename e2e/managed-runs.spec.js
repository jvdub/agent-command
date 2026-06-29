const { test, expect } = require("@playwright/test");
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
    await window.locator("#managed-run-plan-editor").fill(JSON.stringify(plan));
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
    await expect(window.locator("#managed-run-task-list")).toContainText(
      "task-1 · Focused task",
    );
  } finally {
    await electronApp.close();
  }
});
