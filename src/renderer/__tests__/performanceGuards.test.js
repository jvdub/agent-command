/** @jest-environment node */

const fs = require("fs");

describe("renderer performance guards", () => {
  const source = fs.readFileSync("src/renderer/app.js", "utf8");

  test("does not query workspace changes from the general UI refresh", () => {
    const refreshBody = source.match(
      /function refreshVisibleUi\(\) \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(refreshBody).toBeTruthy();
    expect(refreshBody).not.toContain("refreshModifiedFiles");
  });

  test("debounces window resize handling", () => {
    expect(source).toContain("WINDOW_RESIZE_DEBOUNCE_MS");
    expect(source).toMatch(
      /window\.addEventListener\("resize",[\s\S]*?window\.setTimeout\([\s\S]*?WINDOW_RESIZE_DEBOUNCE_MS/,
    );
  });
});
