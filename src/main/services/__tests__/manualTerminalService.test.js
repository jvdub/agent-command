/** @jest-environment node */

const {
  createManualTerminalService,
} = require("../manualTerminalService");
const { IPC_CHANNELS } = require("../../../shared/ipcContract");

function createFakePtyProcess({ exitOnKill = true } = {}) {
  const handlers = {
    data: null,
    exit: null,
  };

  return {
    handlers,
    kill: jest.fn(() => {
      if (exitOnKill) {
        handlers.exit?.({ exitCode: 0, signal: "SIGTERM" });
      }
    }),
    onData: jest.fn((handler) => {
      handlers.data = handler;
      return jest.fn();
    }),
    onExit: jest.fn((handler) => {
      handlers.exit = handler;
      return jest.fn();
    }),
    resize: jest.fn(),
    write: jest.fn(),
  };
}

describe("manualTerminalService", () => {
  test("closing a manual terminal prevents kill-triggered exit events from being sent", () => {
    const ptyProcess = createFakePtyProcess();
    const sendToRenderer = jest.fn();
    const service = createManualTerminalService({
      pty: {
        spawn: jest.fn(() => ptyProcess),
      },
      sessions: new Map([
        [
          "session-1",
          {
            id: "session-1",
            cwd: "/repo",
          },
        ],
      ]),
      sendToRenderer,
      interactiveShellForPlatform: jest.fn(() => "/bin/bash"),
      shellArgsForPlatform: jest.fn(() => []),
      buildPtyEnv: jest.fn(() => ({})),
    });

    service.ensureManualTerminal("session-1", "2");
    const result = service.closeManualTerminal("session-1", "2");

    expect(result).toEqual({ ok: true });
    expect(ptyProcess.kill).toHaveBeenCalled();
    expect(sendToRenderer).not.toHaveBeenCalledWith(
      IPC_CHANNELS.events.manualTerminalExit,
      expect.anything(),
    );
  });

  test("late events from a closed terminal do not stop a replacement terminal with the same id", () => {
    const ptyProcesses = [
      createFakePtyProcess({ exitOnKill: false }),
      createFakePtyProcess(),
    ];
    const sendToRenderer = jest.fn();
    const service = createManualTerminalService({
      pty: {
        spawn: jest.fn(() => ptyProcesses.shift()),
      },
      sessions: new Map([
        [
          "session-1",
          {
            id: "session-1",
            cwd: "/repo",
          },
        ],
      ]),
      sendToRenderer,
      interactiveShellForPlatform: jest.fn(() => "/bin/bash"),
      shellArgsForPlatform: jest.fn(() => []),
      buildPtyEnv: jest.fn(() => ({})),
    });

    const firstPty = service.ensureManualTerminal("session-1", "1").ptyProcess;
    service.closeManualTerminal("session-1", "1");

    const replacement = service.ensureManualTerminal("session-1", "1");
    firstPty.handlers.exit({ exitCode: 0, signal: "SIGTERM" });

    expect(replacement.isRunning).toBe(true);
    expect(service.ensureManualTerminal("session-1", "1")).toBe(replacement);
    expect(sendToRenderer).not.toHaveBeenCalledWith(
      IPC_CHANNELS.events.manualTerminalExit,
      expect.anything(),
    );
  });
});
