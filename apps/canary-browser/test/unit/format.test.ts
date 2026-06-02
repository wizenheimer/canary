import { describe, expect, it } from "vitest";
import { formatDurationMs } from "../../src/util/format.js";

describe("formatDurationMs", () => {
  it("renders sub-second values as ms", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(1)).toBe("1ms");
    expect(formatDurationMs(999)).toBe("999ms");
  });

  it("renders sub-minute values with one decimal", () => {
    expect(formatDurationMs(1000)).toBe("1.0s");
    expect(formatDurationMs(1500)).toBe("1.5s");
    expect(formatDurationMs(59_999)).toBe("60.0s");
  });

  it("renders minute+seconds for >=60s", () => {
    expect(formatDurationMs(60_000)).toBe("1m 0s");
    expect(formatDurationMs(125_000)).toBe("2m 5s");
    expect(formatDurationMs(3_661_000)).toBe("61m 1s");
  });
});
