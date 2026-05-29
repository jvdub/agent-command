import {
  deriveAttentionStatus,
  rehydrateInsightFromBuffer,
  updateInsightFromOutput,
} from "../insights.js";
import { sessionBuffers, sessionInsights } from "../state.js";

describe("insights status classification", () => {
  const sessionId = "session-1";

  function runningSession(id = sessionId) {
    return {
      id,
      isRunning: true,
      exitCode: null,
    };
  }

  beforeEach(() => {
    sessionBuffers.clear();
    sessionInsights.clear();
  });

  test("classifies explicit approval prompts as Needs Permission", () => {
    updateInsightFromOutput(sessionId, "Allow this tool call? [y/n]");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Needs Permission");
  });

  test("detects permission prompts split across chunks", () => {
    updateInsightFromOutput(sessionId, "Allow this tool");
    updateInsightFromOutput(sessionId, " call? [y/n]");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Needs Permission");
  });

  test("classifies explicit questions as Needs Answer", () => {
    updateInsightFromOutput(sessionId, "Which option should I use?");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Needs Answer");
  });

  test("detects questions split across chunks", () => {
    updateInsightFromOutput(sessionId, "Which option should");
    updateInsightFromOutput(sessionId, " I choose?");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Needs Answer");
  });

  test("classifies non-benign failures as Error", () => {
    updateInsightFromOutput(sessionId, "Unhandled exception: task failed");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Error");
  });

  test("detects errors split across chunks", () => {
    updateInsightFromOutput(sessionId, "Unhandled excep");
    updateInsightFromOutput(sessionId, "tion: task failed");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Error");
  });

  test("classifies working activity as Active", () => {
    updateInsightFromOutput(
      sessionId,
      "Thinking through implementation details",
    );

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Active");
    expect(status.detail).toBe("Thinking");
  });

  test("classifies ready prompts as Idle", () => {
    updateInsightFromOutput(sessionId, "message>");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Idle");
  });

  test("detects ready prompts split across chunks", () => {
    updateInsightFromOutput(sessionId, "messa");
    updateInsightFromOutput(sessionId, "ge>");

    const status = deriveAttentionStatus(runningSession());
    expect(status.label).toBe("Idle");
  });

  test("rehydrates last known attention state from buffered output", () => {
    sessionBuffers.set(sessionId, "Thinking...\nAllow this tool call? [y/n]\n");

    rehydrateInsightFromBuffer(runningSession());
    const status = deriveAttentionStatus(runningSession());

    expect(status.label).toBe("Needs Permission");
  });

  test("returns exited-with-error for stopped sessions with non-zero exit", () => {
    const status = deriveAttentionStatus({
      id: sessionId,
      isRunning: false,
      exitCode: 2,
    });

    expect(status.label).toBe("Exited With Error");
    expect(status.className).toBe("error");
  });
});
