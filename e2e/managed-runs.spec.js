const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { launchElectronApp, rootDir } = require("./helpers/electronApp");

test.skip("managed runs require an explicitly approved structured plan", async ({}, testInfo) => {
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
        ...[2, 3, 4, 5].map((number) => ({
          id: `task-${number}`,
          title: `Follow-up task ${number}`,
          objective: `Complete bounded step ${number}`,
          successCriteria: [`Step ${number} passes`],
          dependencies: [`task-${number - 1}`],
          relevantScope: ["src"],
          implementationTier: "standard",
          verificationTier: "standard",
          verificationGuidance: ["Run focused tests"],
          contextNotes: [],
          maxAttempts: 3,
        })),
      ],
    };
    const taskMarkdown = plan.tasks.map((task) => `
## Task \`${task.id}\`: ${task.title}

### Objective

${task.objective}

### Success criteria

- ${task.successCriteria[0]}

### Dependencies

${task.dependencies.length ? task.dependencies.map((dependency) => `- ${dependency}`).join("\n") : "_None_"}

### Maximum attempts

${task.maxAttempts}
`).join("\n");
    await window.locator("#managed-run-plan-editor").fill(`
# Objective

${plan.objective}

# Success criteria

- ${plan.successCriteria[0]}

# Tasks

${taskMarkdown}
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
    const graphContainment = await window.locator("#managed-run-journey").evaluate((viewport) => {
      const bounds = viewport.getBoundingClientRect();
      const nodes = [...viewport.querySelectorAll("[data-task-id]")].map((node) => node.getBoundingClientRect());
      return {
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        nodesFit: nodes.every((node) =>
          node.left >= bounds.left - 1 && node.right <= bounds.right + 1 &&
          node.top >= bounds.top - 1 && node.bottom <= bounds.bottom + 1),
      };
    });
    expect(graphContainment).toEqual({ pageFits: true, nodesFit: true });
    await window.screenshot({
      path: testInfo.outputPath("managed-run-journey.png"),
    });
    await window.locator("#theme-select").selectOption("dark");
    await window.setViewportSize({ width: 900, height: 720 });
    await expect(window.locator(".managed-run-workspace")).toBeVisible();
    await expect(window.locator("#managed-run-inspector")).toBeVisible();
    await expect(window.locator("#managed-run-journey")).toHaveCSS("overflow", "hidden");
    await expect(window.locator("#managed-run-journey-zoom")).toBeVisible();
    await window.screenshot({
      path: testInfo.outputPath("managed-run-journey-dark-narrow.png"),
    });
  } finally {
    await electronApp.close();
  }
});

test.skip("managed runs can initialize an empty target after explicit confirmation", async ({}, testInfo) => {
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
