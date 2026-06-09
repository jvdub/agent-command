import { agenticApp } from "../agenticApp";
import { createSessionLifecycleHandlers } from "../sessionLifecycle";

jest.mock("../agenticApp", () => ({
  agenticApp: {
    restartSession: jest.fn(),
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

  test("ignores duplicate restart requests while one is pending", async () => {
    const setSessionRestartPending = jest.fn(() => false);
    const handlers = createHandlers({ setSessionRestartPending });

    await handlers.restartSessionFromSidebar("session-1");

    expect(agenticApp.restartSession).not.toHaveBeenCalled();
  });
});
