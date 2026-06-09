/** @jest-environment node */

const fs = require("fs");
const path = require("path");

describe("renderer asset paths", () => {
  test("loads runtime assets from the vendored renderer directory", () => {
    const rendererRoot = path.resolve(__dirname, "..");
    const html = fs.readFileSync(path.join(rendererRoot, "index.html"), "utf-8");

    expect(html).toContain("./vendor/@xterm/xterm/css/xterm.css");
    expect(html).toContain("./vendor/monaco-editor/min/vs/loader.js");
    expect(html).toContain('id="theme-select"');
    expect(html).toContain('<option value="system">System default</option>');
    expect(html).toContain('<option value="light">Light</option>');
    expect(html).toContain('<option value="dark">Dark</option>');
    expect(html).not.toContain("../../node_modules/");
  });
});
