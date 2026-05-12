import { describe, expect, it } from "vitest";
import { requestId } from "../../src/util/request-id.js";

describe("requestId", () => {
  it("includes prefix, timestamp, and pid", () => {
    const id = requestId("execute");
    expect(id.startsWith("execute-")).toBe(true);
    const parts = id.split("-");
    expect(parts).toHaveLength(3);
    expect(Number.isFinite(Number.parseInt(parts[1]!, 10))).toBe(true);
    expect(Number.parseInt(parts[2]!, 10)).toBe(process.pid);
  });

  it("uses the supplied prefix verbatim", () => {
    expect(requestId("status").startsWith("status-")).toBe(true);
    expect(requestId("browsers").startsWith("browsers-")).toBe(true);
    expect(requestId("stop").startsWith("stop-")).toBe(true);
  });
});
