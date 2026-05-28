/** @jest-environment node */

const { IPC_CHANNELS } = require("../../../shared/ipcContract");
const { createSessionService } = require("../sessionService");

describe("sessionService integration", () => {
  test("start, write, and stop session roundtrip", () => {
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

    onDataHandler("hello from pty");
    expect(sendToRenderer).toHaveBeenCalledWith(
      IPC_CHANNELS.events.sessionData,
      expect.objectContaining({
        sessionId: session.id,
        data: "hello from pty",
      }),
    );

    const writeResult = service.writeToSession(session.id, "pwd\r");
    expect(writeResult).toEqual({ ok: true });
    expect(fakePtyProcess.write).toHaveBeenCalledWith("pwd\r");

    const stopped = service.stopSessionById(session.id);
    expect(stopped).toBe(true);
    expect(fakePtyProcess.kill).toHaveBeenCalled();

    expect(sendToRenderer).toHaveBeenCalledWith(
      IPC_CHANNELS.events.sessionExit,
      expect.objectContaining({ sessionId: session.id, exitCode: 0 }),
    );
    expect(stopManualTerminalBySessionId).toHaveBeenCalledWith(session.id);
  });
});
