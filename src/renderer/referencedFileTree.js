import { escapeHtml } from "./utils.js";

function createDirectoryNode() {
  return {
    directories: new Map(),
    files: [],
  };
}

function buildReferencedFileTree(references) {
  const root = createDirectoryNode();

  for (const reference of references) {
    const parts = String(reference?.filePath || "")
      .replace(/\\+/g, "/")
      .split("/")
      .filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      continue;
    }

    let directory = root;
    for (const part of parts) {
      if (!directory.directories.has(part)) {
        directory.directories.set(part, createDirectoryNode());
      }
      directory = directory.directories.get(part);
    }

    directory.files.push({
      ...reference,
      fileName,
    });
  }

  return root;
}

function renderDirectoryContents(directory, depth) {
  const directories = Array.from(directory.directories.entries()).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const files = [...directory.files].sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );

  return [
    ...directories.map(
      ([name, child]) => `
        <li class="agent-file-tree-folder">
          <details open>
            <summary class="agent-file-tree-folder-row" style="--file-tree-depth: ${depth}">
              <span class="agent-file-tree-chevron" aria-hidden="true"></span>
              <span class="agent-file-tree-folder-icon" aria-hidden="true"></span>
              <span class="agent-file-tree-name">${escapeHtml(name)}</span>
            </summary>
            <ul class="agent-file-tree-group">
              ${renderDirectoryContents(child, depth + 1)}
            </ul>
          </details>
        </li>
      `,
    ),
    ...files.map((reference) => {
      const line = Number.isInteger(reference.line) ? reference.line : "";
      return `
        <li class="agent-file-tree-file">
          <button
            type="button"
            class="agent-file-entry"
            style="--file-tree-depth: ${depth}"
            data-file-path="${escapeHtml(reference.filePath)}"
            data-file-line="${line}"
            title="Open ${escapeHtml(reference.filePath)}"
          >
            <span class="agent-file-tree-file-icon" aria-hidden="true"></span>
            <span class="agent-file-tree-name">${escapeHtml(reference.fileName)}</span>
            ${line !== "" ? `<span class="agent-file-tree-line">:${line}</span>` : ""}
          </button>
        </li>
      `;
    }),
  ].join("");
}

export function renderReferencedFileTree(references) {
  const tree = buildReferencedFileTree(references);
  return `
    <ul class="agent-file-tree" aria-label="Referenced files">
      ${renderDirectoryContents(tree, 0)}
    </ul>
  `;
}
