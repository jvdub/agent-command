const fs = require("fs");

describe("managed session work-area overlay", () => {
  const css = fs.readFileSync("src/renderer/styles.css", "utf8");

  test("uses the workspace as the overlay boundary", () => {
    expect(css).toMatch(
      /\.workspace\s*\{[^}]*position:\s*relative;/s,
    );
    expect(css).toMatch(
      /\.managed-run-session-panel\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s,
    );
    expect(css).not.toMatch(
      /\.managed-run-session-panel\s*\{[^}]*position:\s*fixed;/s,
    );
  });

  test("lets the managed terminal fill the remaining work area", () => {
    expect(css).toMatch(
      /\.managed-run-session-terminal\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s,
    );
  });
});
