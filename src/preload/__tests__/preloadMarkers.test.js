/** @jest-environment node */

const fs = require("fs");
const path = require("path");

describe("preload IPC marker sync", () => {
  test("contains generated IPC channel markers", () => {
    const preloadPath = path.resolve(__dirname, "../../preload.js");
    const source = fs.readFileSync(preloadPath, "utf8");

    expect(source).toContain("// BEGIN AUTO-GENERATED IPC CHANNELS");
    expect(source).toContain("// END AUTO-GENERATED IPC CHANNELS");
  });
});
