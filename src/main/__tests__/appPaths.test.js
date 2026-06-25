/** @jest-environment node */

const path = require("path");
const {
  STABLE_USER_DATA_DIR_NAME,
  configureStableUserDataPath,
  getStableUserDataPath,
  hasExplicitUserDataDir,
} = require("../appPaths");

describe("appPaths", () => {
  test("derives userData from the original stable app folder name", () => {
    const app = {
      getPath: jest.fn((name) => {
        if (name === "appData") {
          return path.join("C:", "Users", "john", "AppData", "Roaming");
        }
        throw new Error(`Unexpected path request: ${name}`);
      }),
    };

    expect(getStableUserDataPath(app)).toBe(
      path.join(
        "C:",
        "Users",
        "john",
        "AppData",
        "Roaming",
        STABLE_USER_DATA_DIR_NAME,
      ),
    );
  });

  test("pins Electron userData even when productName changes the default folder", () => {
    const app = {
      getPath: jest.fn((name) => {
        if (name === "appData") {
          return path.join("C:", "Users", "john", "AppData", "Roaming");
        }
        if (name === "userData") {
          return path.join(
            "C:",
            "Users",
            "john",
            "AppData",
            "Roaming",
            "Agentic Command",
          );
        }
        throw new Error(`Unexpected path request: ${name}`);
      }),
      setPath: jest.fn(),
    };

    const stableUserDataPath = configureStableUserDataPath(app, path, [
      "electron",
      ".",
    ]);

    expect(stableUserDataPath).toBe(
      path.join(
        "C:",
        "Users",
        "john",
        "AppData",
        "Roaming",
        STABLE_USER_DATA_DIR_NAME,
      ),
    );
    expect(app.setPath).toHaveBeenCalledWith("userData", stableUserDataPath);
  });

  test("leaves userData alone when it already points at the stable folder", () => {
    const stablePath = path.join(
      "C:",
      "Users",
      "john",
      "AppData",
      "Roaming",
      STABLE_USER_DATA_DIR_NAME,
    );
    const app = {
      getPath: jest.fn((name) => {
        if (name === "appData") {
          return path.dirname(stablePath);
        }
        if (name === "userData") {
          return stablePath;
        }
        throw new Error(`Unexpected path request: ${name}`);
      }),
      setPath: jest.fn(),
    };

    configureStableUserDataPath(app, path, ["electron", "."]);

    expect(app.setPath).not.toHaveBeenCalled();
  });

  test("keeps explicitly supplied userData directories for isolated launches", () => {
    const explicitUserDataPath = path.join("C:", "tmp", "e2e-user-data");
    const app = {
      getPath: jest.fn((name) => {
        if (name === "userData") {
          return explicitUserDataPath;
        }
        if (name === "appData") {
          return path.join("C:", "Users", "john", "AppData", "Roaming");
        }
        throw new Error(`Unexpected path request: ${name}`);
      }),
      setPath: jest.fn(),
    };

    expect(hasExplicitUserDataDir(["electron", "--user-data-dir=C:\\tmp"])).toBe(
      true,
    );
    expect(configureStableUserDataPath(app, path, [
      "electron",
      `--user-data-dir=${explicitUserDataPath}`,
      ".",
    ])).toBe(explicitUserDataPath);
    expect(app.setPath).not.toHaveBeenCalled();
  });
});
