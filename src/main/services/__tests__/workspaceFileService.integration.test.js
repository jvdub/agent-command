/** @jest-environment node */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { IPC_CHANNELS } = require("../../../shared/ipcContract");
const { createWorkspaceFileService } = require("../workspaceFileService");

describe("workspaceFileService integration", () => {
  test("opens terminal-style paths with line and column suffixes", async () => {
    const workspace = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "agentic-command-workspace-"),
    );
    const sourceDirectory = path.join(workspace, "src folder");
    const filePath = path.join(sourceDirectory, "main.js");
    await fs.promises.mkdir(sourceDirectory);
    await fs.promises.writeFile(filePath, "content", "utf-8");

    const watcher = {
      close: jest.fn(),
      on: jest.fn(),
    };
    const service = createWorkspaceFileService({
      sessions: new Map([
        ["session-1", { id: "session-1", cwd: workspace }],
      ]),
      dialog: {},
      getMainWindow: jest.fn(),
      resolveInitialDirectory: () => workspace,
      watch: jest.fn(() => watcher),
    });

    await expect(
      service.openEditorFile("session-1", `${filePath}:12:4`),
    ).resolves.toEqual(
      expect.objectContaining({
        absolutePath: filePath,
        relativePath: path.join("src folder", "main.js"),
        content: "content",
      }),
    );

    service.stopWatchingEditorFile();
    await fs.promises.rm(workspace, { recursive: true, force: true });
  });

  test("publishes updated content when the open editor file changes", async () => {
    jest.useFakeTimers();

    const workspace = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "agentic-command-workspace-"),
    );
    const sourceDirectory = path.join(workspace, "src");
    const filePath = path.join(sourceDirectory, "main.js");
    await fs.promises.mkdir(sourceDirectory);
    await fs.promises.writeFile(filePath, "before", "utf-8");

    const sessions = new Map([
      ["session-1", { id: "session-1", cwd: workspace }],
    ]);
    let resolvePublishedChange;
    const publishedChange = new Promise((resolve) => {
      resolvePublishedChange = resolve;
    });
    const sendToRenderer = jest.fn(() => resolvePublishedChange());
    let watchHandler = null;
    const watcher = {
      close: jest.fn(),
      on: jest.fn(),
    };
    const watch = jest.fn((_directory, _options, handler) => {
      watchHandler = handler;
      return watcher;
    });

    const service = createWorkspaceFileService({
      sessions,
      dialog: {},
      getMainWindow: jest.fn(),
      resolveInitialDirectory: () => workspace,
      sendToRenderer,
      watch,
    });

    await expect(
      service.openEditorFile("session-1", "src/main.js"),
    ).resolves.toEqual(
      expect.objectContaining({
        absolutePath: filePath,
        content: "before",
      }),
    );

    expect(watch).toHaveBeenCalledWith(
      sourceDirectory,
      { persistent: false },
      expect.any(Function),
    );

    await fs.promises.writeFile(filePath, "after", "utf-8");
    watchHandler("change", "main.js");
    await jest.advanceTimersByTimeAsync(75);
    await publishedChange;

    expect(sendToRenderer).toHaveBeenCalledWith(
      IPC_CHANNELS.events.workspaceFileChanged,
      expect.objectContaining({
        sessionId: "session-1",
        absolutePath: filePath,
        content: "after",
      }),
    );

    service.stopWatchingEditorFile();
    expect(watcher.close).toHaveBeenCalled();

    await fs.promises.rm(workspace, { recursive: true, force: true });
    jest.useRealTimers();
  });
});
