import { agenticApp } from "../agenticApp";
import { createSessionLifecycleHandlers } from "../sessionLifecycle";

jest.mock("../agenticApp", () => ({
  agenticApp: {
    listSessions: jest.fn(),
    restartSession: jest.fn(),
    startSession: jest.fn(),
  },
}));

describe("session lifecycle restart feedback", () => {
  function createHandlers(overrides = {}) {
    return createSessionLifecycleHandlers({
      setProcessInspectionSupport: jest.fn(),
      cwdInput: document.createElement("input"),
      setStatus: jest.fn(),
      updateSessions: jest.fn(),
      labelInput: document.createElement("input"),
      commandInput: document.createElement("input"),
      argsInput: document.createElement("input"),
      ensureSessionBuffer: jest.fn(),
      ensureSessionInsight: jest.fn(),
      createSessionTerminal: jest.fn(),
      getSessionDisplayName: () => "Test session",
      closeSessionPopover: jest.fn(),
      openTerminalView: jest.fn(),
      getActiveSessionId: jest.fn(),
      markSessionInput: jest.fn(),
      scheduleUiRefresh: jest.fn(),
      showEmptyView: jest.fn(),
      setSessionRestartPending: jest.fn(() => true),
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    agenticApp.listSessions.mockResolvedValue({ sessions: [] });
  });

  test("synchronizes session state before opening a newly started session", async () => {
    const session = {
      id: "session-1",
      cwd: "C:\\repo",
      label: "Test session",
    };
    agenticApp.startSession.mockResolvedValue({ session });
    agenticApp.listSessions.mockResolvedValue({ sessions: [session] });
    const updateSessions = jest.fn();
    const openTerminalView = jest.fn();
    const commandInput = document.createElement("input");
    commandInput.value = "copilot";
    const handlers = createHandlers({
      commandInput,
      updateSessions,
      openTerminalView,
    });

    await handlers.startSession({ preventDefault: jest.fn() });

    expect(updateSessions).toHaveBeenCalledWith([session]);
    expect(openTerminalView).toHaveBeenCalledWith(session.id);
    expect(updateSessions.mock.invocationCallOrder[0]).toBeLessThan(
      openTerminalView.mock.invocationCallOrder[0],
    );
  });

  test("shows pending feedback before waiting for restart", async () => {
    let resolveRestart;
    agenticApp.restartSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRestart = resolve;
      }),
    );
    const setStatus = jest.fn();
    const setSessionRestartPending = jest.fn(() => true);
    const handlers = createHandlers({ setStatus, setSessionRestartPending });

    const restartPromise = handlers.restartSessionFromSidebar("session-1");

    expect(setSessionRestartPending).toHaveBeenCalledWith("session-1", true);
    expect(setStatus).toHaveBeenCalledWith(
      "Restarting",
      "Restarting session...",
    );

    resolveRestart({
      session: { id: "session-1", cwd: "C:\\repo", label: "Test session" },
    });
    await restartPromise;

    expect(setSessionRestartPending).toHaveBeenLastCalledWith(
      "session-1",
      false,
    );
  });

  test("forces a fresh PTY resize after restart", async () => {
    const session = {
      id: "session-1",
      cwd: "C:\\repo",
      label: "Test session",
    };
    agenticApp.restartSession.mockResolvedValue({ session });
    agenticApp.listSessions.mockResolvedValue({ sessions: [session] });
    const openTerminalView = jest.fn();
    const handlers = createHandlers({ openTerminalView });

    await handlers.restartSessionFromSidebar(session.id);

    expect(openTerminalView).toHaveBeenCalledWith(session.id, {
      forceResize: true,
    });
  });

  test("ignores duplicate restart requests while one is pending", async () => {
    const setSessionRestartPending = jest.fn(() => false);
    const handlers = createHandlers({ setSessionRestartPending });

    await handlers.restartSessionFromSidebar("session-1");

    expect(agenticApp.restartSession).not.toHaveBeenCalled();
  });
});
