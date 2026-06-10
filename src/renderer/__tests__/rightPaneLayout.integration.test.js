const fs = require("fs");

describe("right pane layout", () => {
  const html = fs.readFileSync("src/renderer/index.html", "utf8");
  const css = fs.readFileSync("src/renderer/styles.css", "utf8");

  test("uses one tabbed manual terminal host with an add button", () => {
    expect(html).toContain('id="manual-terminal-tabs"');
    expect(html).toContain('id="add-manual-terminal"');
    expect(html).toContain('id="manual-terminal"');
    expect(html).not.toContain('id="manual-terminal-1"');
    expect(html).not.toContain('id="manual-terminal-2"');
  });

  test("places modified files above the terminal area", () => {
    expect(html.indexOf('id="modified-files-list"')).toBeLessThan(
      html.indexOf('id="manual-pane"'),
    );
    expect(css).toMatch(
      /\.right-pane\s*\{[^}]*grid-template-rows:\s*minmax\(140px,\s*32%\)\s*minmax\(0,\s*1fr\);/s,
    );
  });
});
