import { renderReferencedFileTree } from "../referencedFileTree.js";

describe("renderReferencedFileTree", () => {
  it("groups referenced files into an escaped folder hierarchy", () => {
    document.body.innerHTML = renderReferencedFileTree([
      { filePath: "src/renderer/app.js", line: 42 },
      { filePath: "src/main.js", line: null },
      { filePath: "README.md", line: 7 },
      { filePath: "src/<unsafe>.js", line: null },
    ]);

    const folders = Array.from(
      document.querySelectorAll(".agent-file-tree-folder-row"),
      (element) => element.textContent.trim(),
    );
    const entries = Array.from(
      document.querySelectorAll(".agent-file-entry"),
      (element) => ({
        path: element.dataset.filePath,
        label: element.textContent.replace(/\s+/g, " ").trim(),
      }),
    );

    expect(folders).toEqual(["src", "renderer"]);
    expect(entries).toEqual([
      { path: "src/renderer/app.js", label: "app.js :42" },
      { path: "src/<unsafe>.js", label: "<unsafe>.js" },
      { path: "src/main.js", label: "main.js" },
      { path: "README.md", label: "README.md :7" },
    ]);
    expect(document.body.innerHTML).not.toContain("<unsafe>.js</span>");
  });

  it("normalizes Windows separators into folders", () => {
    document.body.innerHTML = renderReferencedFileTree([
      { filePath: "src\\renderer\\styles.css", line: null },
    ]);

    expect(document.querySelectorAll(".agent-file-tree-folder-row")).toHaveLength(2);
    expect(document.querySelector(".agent-file-entry").textContent).toContain(
      "styles.css",
    );
  });
});
