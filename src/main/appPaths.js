const path = require("path");

const STABLE_USER_DATA_DIR_NAME = "agentic-command";

function normalizeForComparison(value) {
  return path.normalize(String(value || "")).toLowerCase();
}

function getStableUserDataPath(app, pathModule = path) {
  return pathModule.join(app.getPath("appData"), STABLE_USER_DATA_DIR_NAME);
}

function hasExplicitUserDataDir(argv = process.argv) {
  return argv.some((arg) => String(arg || "").startsWith("--user-data-dir"));
}

function configureStableUserDataPath(
  app,
  pathModule = path,
  argv = process.argv,
) {
  if (hasExplicitUserDataDir(argv)) {
    return app.getPath("userData");
  }

  const stableUserDataPath = getStableUserDataPath(app, pathModule);
  const currentUserDataPath = app.getPath("userData");

  if (
    normalizeForComparison(currentUserDataPath) !==
    normalizeForComparison(stableUserDataPath)
  ) {
    app.setPath("userData", stableUserDataPath);
  }

  return stableUserDataPath;
}

module.exports = {
  STABLE_USER_DATA_DIR_NAME,
  configureStableUserDataPath,
  getStableUserDataPath,
  hasExplicitUserDataDir,
};
