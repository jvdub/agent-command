const fs = require("fs");

describe("terminal overflow layout", () => {
  const css = fs.readFileSync("src/renderer/styles.css", "utf8");

  test.each([".agent-pane", ".manual-pane", ".terminal"])(
    "%s clips overflow so xterm owns scrolling",
    (selector) => {
      expect(css).toMatch(
        new RegExp(
          `${selector.replace(".", "\\.")}\\s*\\{[^}]*overflow:\\s*hidden;`,
          "s",
        ),
      );
    },
  );

  test("hides xterm's browser-drawn viewport scrollbar", () => {
    expect(css).toMatch(
      /\.terminal \.xterm-viewport\s*\{[^}]*overflow-y:\s*hidden;/s,
    );
  });
});
