import { TERMINAL_OPTIONS } from "../constants";

describe("terminal theme contrast", () => {
  test("keeps ANSI text readable when terminal apps paint custom backgrounds", () => {
    expect(TERMINAL_OPTIONS.minimumContrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});
