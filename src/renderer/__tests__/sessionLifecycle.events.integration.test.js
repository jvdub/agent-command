import { agenticApp } from "../agenticApp";
import { bindSessionEvents } from "../sessionLifecycle";

jest.mock("../agenticApp", () => ({
  agenticApp: {
    onManualTerminalData: jest.fn(),
    onManualTerminalExit: jest.fn(),
    onSessionData: jest.fn(),
    onSessionExit: jest.fn(),
    onSessionsChanged: jest.fn(),
  },
}));

describe("session lifecycle events", () => {
  test("reports a failed active session without exposing a resize error", () => {
    let onExit;
    agenticApp.onSessionExit.mockImplementation((listener) => {
      onExit = listener;
    });
    const setStatus = jest.fn();

    bindSessionEvents({
      updateInsightFromOutput: jest.fn(),
      appendSessionBuffer: jest.fn(),
      ingestFileReferences: jest.fn(),
      sessionTerminals: new Map(),
      renderSessionFileReferences: jest.fn(),
      getActiveSessionId: () => "session-1",
      scheduleUiRefresh: jest.fn(),
      ensureSessionInsight: () => ({}),
      manualTerminalKey: jest.fn(),
      manualTerminalBuffers: new Map(),
      manualTerminals: new Map(),
      updateSessions: jest.fn(),
      setStatus,
    });

    onExit({ sessionId: "session-1", exitCode: 1, signal: null });

    expect(setStatus).toHaveBeenCalledWith(
      "Error",
      "Session exited with code 1; check the terminal output",
    );
  });

  test("treats an intentional stop as stopped even when Windows returns code 1", () => {
    let onExit;
    agenticApp.onSessionExit.mockImplementation((listener) => {
      onExit = listener;
    });
    const setStatus = jest.fn();
    const insight = {};

    bindSessionEvents({
      updateInsightFromOutput: jest.fn(),
      appendSessionBuffer: jest.fn(),
      ingestFileReferences: jest.fn(),
      sessionTerminals: new Map(),
      renderSessionFileReferences: jest.fn(),
      getActiveSessionId: () => "session-1",
      scheduleUiRefresh: jest.fn(),
      ensureSessionInsight: () => insight,
      manualTerminalKey: jest.fn(),
      manualTerminalBuffers: new Map(),
      manualTerminals: new Map(),
      updateSessions: jest.fn(),
      setStatus,
    });

    onExit({
      sessionId: "session-1",
      exitCode: 1,
      signal: null,
      stoppedByUser: true,
    });

    expect(setStatus).toHaveBeenCalledWith("Stopped", "Session exited");
    expect(insight.hasError).not.toBe(true);
  });
});
