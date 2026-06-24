/** @jest-environment node */

const { IPC_CHANNELS } = require("../../../shared/ipcContract");
const { createSessionService } = require("../sessionService");

describe("sessionService integration", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("start, write, and stop session roundtrip", () => {
    jest.useFakeTimers();
    const sessions = new Map();
    const sendToRenderer = jest.fn();
    const saveSessionsToDisk = jest.fn();
    const stopManualTerminalBySessionId = jest.fn();

    let onDataHandler = null;
    let onExitHandler = null;

    const fakePtyProcess = {
      onData: jest.fn((handler) => {
        onDataHandler = handler;
        return () => {};
      }),
      onExit: jest.fn((handler) => {
        onExitHandler = handler;
        return () => {};
      }),
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(() => {
        if (onExitHandler) {
          onExitHandler({ exitCode: 0, signal: null });
        }
      }),
    };

    const spawnSessionPty = jest.fn(() => fakePtyProcess);

    const service = createSessionService({
      sessions,
      pty: {},
      sendToRenderer,
      buildPtyEnv: () => ({ TERM: "xterm-256color" }),
      splitArgs: (value) =>
        String(value || "")
          .split(/\s+/)
          .filter(Boolean),
      spawnSessionPty,
      persistenceService: {
        saveSessionsToDisk,
        deleteSessionFromDisk: jest.fn(),
      },
      manualTerminalService: {
        stopManualTerminalBySessionId,
      },
    });

    const session = service.startSession(
      {
        command: "copilot",
        args: "--continue",
        cwd: "/repo",
      },
      "/repo",
    );

    expect(session.id).toBeTruthy();
    expect(session.isRunning).toBe(true);
    expect(spawnSessionPty).toHaveBeenCalledWith(
      {},
      "copilot",
      ["--continue"],
      expect.objectContaining({ cwd: "/repo" }),
    );
    expect(saveSessionsToDisk).toHaveBeenCalled();

    const renamed = service.renameSession(session.id, "  Renamed session  ");
    expect(renamed.label).toBe("Renamed session");
    expect(service.listSessions()[0].label).toBe("Renamed session");

    onDataHandler("hello ");
    onDataHandler("from pty");
    expect(sendToRenderer).not.toHaveBeenCalledWith(
      IPC_CHANNELS.events.sessionData,
      expect.anything(),
    );
    jest.advanceTimersByTime(16);
    expect(sendToRenderer).toHaveBeenCalledWith(
      IPC_CHANNELS.events.sessionData,
      expect.objectContaining({
        sessionId: session.id,
        data: "hello from pty",
      }),
    );
    expect(
      sendToRenderer.mock.calls.filter(
        ([channel]) => channel === IPC_CHANNELS.events.sessionData,
      ),
    ).toHaveLength(1);

    const writeResult = service.writeToSession(session.id, "pwd\r");
    expect(writeResult).toEqual({ ok: true });
    expect(fakePtyProcess.write).toHaveBeenCalledWith("pwd\r");

    onDataHandler("tail before exit");
    const stopped = service.stopSessionById(session.id);
    expect(stopped).toBe(true);
    expect(fakePtyProcess.kill).toHaveBeenCalled();
    expect(sendToRenderer).toHaveBeenCalledWith(
      IPC_CHANNELS.events.sessionData,
      expect.objectContaining({
        sessionId: session.id,
        data: "tail before exit",
      }),
    );

    expect(sendToRenderer).toHaveBeenCalledWith(
      IPC_CHANNELS.events.sessionExit,
      expect.objectContaining({
        sessionId: session.id,
        exitCode: 0,
        stoppedByUser: true,
      }),
    );
    expect(stopManualTerminalBySessionId).toHaveBeenCalledWith(session.id);

    expect(service.clearStoppedSessions()).toEqual({ removed: 1 });
    expect(service.listSessions()).toEqual([]);
  });

  test("ignores the expected resize race after a PTY exits", () => {
    const sessions = new Map([
      [
        "session-1",
        {
          id: "session-1",
          isRunning: true,
          ptyProcess: {
            resize: jest.fn(() => {
              throw new Error("Cannot resize a pty that has already exited");
            }),
          },
        },
      ],
    ]);

    const service = createSessionService({
      sessions,
      pty: {},
      sendToRenderer: jest.fn(),
      buildPtyEnv: jest.fn(),
      splitArgs: jest.fn(),
      spawnSessionPty: jest.fn(),
      persistenceService: {
        saveSessionsToDisk: jest.fn(),
        deleteSessionFromDisk: jest.fn(),
      },
      manualTerminalService: {
        stopManualTerminalBySessionId: jest.fn(),
      },
    });

    expect(service.resizeSession("session-1", 120, 36)).toEqual({ ok: false });
  });
});
