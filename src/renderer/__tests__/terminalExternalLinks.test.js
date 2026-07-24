/** @jest-environment node */

const fs = require("fs");
const path = require("path");

describe("terminal external links", () => {
  test("routes both OSC 8 hyperlinks and plain URLs through the external URL bridge", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "app.js"),
      "utf-8",
    );

    expect(
      source.match(/linkHandler: createTerminalLinkHandler\(\{/g),
    ).toHaveLength(2);
    expect(source).toContain(
      "activate: (event, uri) => openTerminalLink(instance, event, uri)",
    );
    expect(source).toContain(
      "openTerminalLink(instance, event, uri)",
    );
    expect(source).toContain("agenticApp.openExternalUrl(target)");
  });
});
