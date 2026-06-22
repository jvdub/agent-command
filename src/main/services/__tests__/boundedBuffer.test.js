/** @jest-environment node */

const {
  appendBoundedBuffer,
  boundTerminalBuffer,
} = require("../boundedBuffer");

describe("main-process terminal buffers", () => {
  test("retains recent output within the configured limit", () => {
    expect(appendBoundedBuffer("abcd", "efgh", 6)).toBe("cdefgh");
  });

  test("bounds restored output before it enters a session", () => {
    expect(boundTerminalBuffer("abcdefgh", 5)).toBe("defgh");
  });
});
