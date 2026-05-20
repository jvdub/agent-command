import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const checkOnly = process.argv.includes("--check");

const preloadPath = path.join(projectRoot, "src/preload.js");
const ipcContractPath = path.join(projectRoot, "src/shared/ipcContract.js");

const GENERATED_BEGIN = "// BEGIN AUTO-GENERATED IPC CHANNELS";
const GENERATED_END = "// END AUTO-GENERATED IPC CHANNELS";

const require = createRequire(import.meta.url);

function renderFrozenObject(value, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  const nestedIndent = "  ".repeat(indentLevel + 1);
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return "Object.freeze({})";
  }

  const lines = entries.map(([key, entryValue]) => {
    if (entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)) {
      const rendered = renderFrozenObject(entryValue, indentLevel + 1);
      return `${nestedIndent}${key}: ${rendered},`;
    }

    return `${nestedIndent}${key}: ${JSON.stringify(entryValue)},`;
  });

  return `Object.freeze({\n${lines.join("\n")}\n${indent}})`;
}

function buildGeneratedSection(ipcChannels) {
  const renderedChannels = renderFrozenObject(ipcChannels, 0);

  return [
    GENERATED_BEGIN,
    "const IPC_CHANNELS = " + renderedChannels + ";",
    GENERATED_END,
  ].join("\n");
}

function updateGeneratedSection(preloadSource, generatedSection) {
  const beginIndex = preloadSource.indexOf(GENERATED_BEGIN);
  const endIndex = preloadSource.indexOf(GENERATED_END);

  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(
      "Missing generated IPC channel markers in src/preload.js. " +
        `Expected markers: \"${GENERATED_BEGIN}\" and \"${GENERATED_END}\".`,
    );
  }

  const afterEnd = preloadSource.indexOf("\n", endIndex);
  const replaceEnd = afterEnd === -1 ? preloadSource.length : afterEnd;

  return preloadSource.slice(0, beginIndex) + generatedSection + preloadSource.slice(replaceEnd);
}

async function main() {
  const { IPC_CHANNELS } = require(ipcContractPath);

  if (!IPC_CHANNELS || typeof IPC_CHANNELS !== "object") {
    throw new Error("IPC_CHANNELS was not found in src/shared/ipcContract.js");
  }

  const preloadSource = await readFile(preloadPath, "utf8");
  const generatedSection = buildGeneratedSection(IPC_CHANNELS);
  const nextSource = updateGeneratedSection(preloadSource, generatedSection);

  if (nextSource === preloadSource) {
    return;
  }

  if (checkOnly) {
    throw new Error("src/preload.js IPC channel section is out of sync");
  }

  await writeFile(preloadPath, nextSource, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});