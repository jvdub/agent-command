import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const checkOnly = process.argv.includes("--check");

const assetMappings = [
  {
    source: "node_modules/@xterm/xterm/css",
    target: "src/renderer/vendor/@xterm/xterm/css",
  },
  {
    source: "node_modules/@xterm/xterm/lib",
    target: "src/renderer/vendor/@xterm/xterm/lib",
  },
  {
    source: "node_modules/@xterm/addon-fit/lib",
    target: "src/renderer/vendor/@xterm/addon-fit/lib",
  },
  {
    source: "node_modules/@xterm/addon-search/lib",
    target: "src/renderer/vendor/@xterm/addon-search/lib",
  },
  {
    source: "node_modules/@xterm/addon-web-links/lib",
    target: "src/renderer/vendor/@xterm/addon-web-links/lib",
  },
  {
    source: "node_modules/monaco-editor/min/vs",
    target: "src/renderer/vendor/monaco-editor/min/vs",
  },
];

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function verifyMappings() {
  const missing = [];

  for (const mapping of assetMappings) {
    const sourcePath = path.join(projectRoot, mapping.source);
    const targetPath = path.join(projectRoot, mapping.target);

    if (!(await pathExists(sourcePath))) {
      missing.push(`missing source: ${mapping.source}`);
    }

    if (checkOnly && !(await pathExists(targetPath))) {
      missing.push(`missing target: ${mapping.target}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(missing.join("\n"));
  }
}

async function syncMappings() {
  for (const mapping of assetMappings) {
    const sourcePath = path.join(projectRoot, mapping.source);
    const targetPath = path.join(projectRoot, mapping.target);

    await rm(targetPath, { force: true, recursive: true });
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true, recursive: true });
  }
}

async function main() {
  await verifyMappings();

  if (!checkOnly) {
    await syncMappings();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
