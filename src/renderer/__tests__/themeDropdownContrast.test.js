const fs = require("fs");

describe("theme dropdown contrast", () => {
  const css = fs.readFileSync("src/renderer/styles.css", "utf8");

  test("uses a solid dark option background in dark mode", () => {
    expect(css).toMatch(/:root\s*{[\s\S]*--select-option-bg:\s*#111218;/);
    expect(css).toMatch(
      /select option\s*{[\s\S]*background:\s*var\(--select-option-bg\);[\s\S]*color:\s*var\(--text\);/,
    );
  });

  test("keeps option backgrounds light in light mode", () => {
    expect(css).toMatch(
      /:root\[data-theme="light"\]\s*{[\s\S]*--select-option-bg:\s*#ffffff;/,
    );
  });
});
