/** @jest-environment node */

const { IPC_CHANNELS } = require("../../../shared/ipcContract");
const { registerIpcHandlers } = require("../registerIpcHandlers");

describe("registerIpcHandlers", () => {
  test("registers domain handlers and routes to services", async () => {
    const handlerMap = new Map();
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlerMap.set(channel, handler);
      }),
    };

    const services = {
      processInspectionService: {
        isProcessInspectionSupported: jest.fn(() => true),
        getSessionChildProcesses: jest.fn(async () => ({
          processes: [{ pid: 101, comm: "node" }],
          supported: true,
        })),
      },
      sessionService: {
        startSession: jest.fn(() => ({
          id: "session-1",
          command: "copilot",
          args: ["--continue"],
          cwd: "/repo",
          outputBuffer: "",
          isRunning: true,
          createdAt: Date.now(),
          endedAt: null,
          exitCode: null,
          signal: null,
          label: "",
        })),
        listSessions: jest.fn(() => []),
        stopSessionById: jest.fn(() => true),
        restartSession: jest.fn(() => ({ id: "session-1" })),
        removeSession: jest.fn(() => ({ removed: true })),
        writeToSession: jest.fn(() => ({ ok: true })),
        resizeSession: jest.fn(() => ({ ok: true })),
      },
      workspaceFileService: {
        ensureWorkingDirectory: jest.fn(async (cwd) => cwd || "/repo"),
        openEditorFile: jest.fn(async () => ({
          absolutePath: "/repo/src/main.js",
          relativePath: "src/main.js",
          content: "const x = 1;",
        })),
        listWorkspaceFilesForRoot: jest.fn(async () => ({ files: [] })),
        saveEditorFile: jest.fn(async () => ({ ok: true })),
      },
      manualTerminalService: {
        ensureManualTerminal: jest.fn(() => ({
          cwd: "/repo",
          shell: "/bin/bash",
          terminalId: "1",
          isRunning: true,
          outputBuffer: "",
          ptyProcess: { write: jest.fn(), resize: jest.fn() },
        })),
      },
    };

    const registry = registerIpcHandlers({
      ipcMain,
      dialog: {
        showOpenDialog: jest.fn(async () => ({
          canceled: true,
          filePaths: [],
        })),
      },
      shell: { openExternal: jest.fn(async () => {}) },
      resolveInitialDirectory: jest.fn(() => "/repo"),
      shellForPlatform: jest.fn(() => "/bin/bash"),
      ...services,
    });

    registry.setup();

    expect(handlerMap.has(IPC_CHANNELS.invoke.startSession)).toBe(true);
    expect(handlerMap.has(IPC_CHANNELS.invoke.openWorkspaceFile)).toBe(true);
    expect(handlerMap.has(IPC_CHANNELS.invoke.getContext)).toBe(true);

    const startHandler = handlerMap.get(IPC_CHANNELS.invoke.startSession);
    const startResult = await startHandler(
      {},
      {
        command: "copilot",
        args: "--continue",
        cwd: "/repo",
      },
    );

    expect(startResult).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ id: "session-1" }),
        shell: "/bin/bash",
      }),
    );

    const openFileHandler = handlerMap.get(
      IPC_CHANNELS.invoke.openWorkspaceFile,
    );
    const openResult = await openFileHandler(
      {},
      {
        sessionId: "session-1",
        filePath: "src/main.js",
      },
    );

    expect(openResult).toEqual(
      expect.objectContaining({ relativePath: "src/main.js" }),
    );
    expect(services.workspaceFileService.openEditorFile).toHaveBeenCalledWith(
      "session-1",
      "src/main.js",
    );
  });
});
