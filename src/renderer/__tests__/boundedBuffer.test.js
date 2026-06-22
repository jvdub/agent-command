import {
  appendBoundedBuffer,
  boundTerminalBuffer,
} from "../boundedBuffer.js";

describe("renderer terminal buffers", () => {
  test("retains recent output within the configured limit", () => {
    expect(appendBoundedBuffer("abcd", "efgh", 6)).toBe("cdefgh");
  });

  test("bounds output restored from the main process", () => {
    expect(boundTerminalBuffer("abcdefgh", 5)).toBe("defgh");
  });
});
