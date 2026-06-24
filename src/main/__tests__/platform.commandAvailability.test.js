/** @jest-environment node */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { isCommandAvailable, isSupportedPlatform } = require("../platform");

describe("command availability", () => {
  let binDir;

  beforeEach(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-bin-"));
  });

  afterEach(() => {
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  test("finds a Windows executable through PATH and PATHEXT", () => {
    fs.writeFileSync(path.join(binDir, "agent.CMD"), "@echo off", "utf8");

    expect(
      isCommandAvailable("agent", {
        env: { PATH: binDir, PATHEXT: ".EXE;.CMD" },
        platform: "win32",
      }),
    ).toBe(true);
  });

  test("returns false when an executable is absent", () => {
    expect(
      isCommandAvailable("missing-agent", {
        env: { PATH: binDir, PATHEXT: ".EXE;.CMD" },
        platform: "win32",
      }),
    ).toBe(false);
  });

  test("finds an executable Linux command and rejects a non-executable file", () => {
    const fileSystem = {
      constants: fs.constants,
      accessSync: jest.fn((candidate, mode) => {
        expect(mode).toBe(fs.constants.X_OK);
        if (candidate.endsWith("notes")) {
          throw new Error("not executable");
        }
      }),
    };

    expect(
      isCommandAvailable("agent", {
        env: { PATH: binDir },
        fileSystem,
        platform: "linux",
      }),
    ).toBe(true);
    expect(
      isCommandAvailable("notes", {
        env: { PATH: binDir },
        fileSystem,
        platform: "linux",
      }),
    ).toBe(false);
  });

  test("supports native Windows and Linux", () => {
    expect(isSupportedPlatform("win32")).toBe(true);
    expect(isSupportedPlatform("linux")).toBe(true);
    expect(isSupportedPlatform("darwin")).toBe(false);
  });
});
