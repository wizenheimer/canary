import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseTraceActions } from "./parse-trace.js";

function makeTraceZip(events: unknown[]): Uint8Array {
  const text = events.map((e) => JSON.stringify(e)).join("\n");
  return zipSync({ "trace.trace": strToU8(text) });
}

describe("parseTraceActions", () => {
  it("groups actions by step and reconstructs Class.method names", () => {
    const zip = makeTraceZip([
      { browserName: "chromium", type: "context-options" },
      {
        callId: "g1",
        class: "Tracing",
        method: "tracingGroup",
        startTime: 100,
        title: "open-home",
        type: "before",
      },
      {
        callId: "c1",
        class: "Frame",
        method: "goto",
        params: { timeout: 30_000, url: "https://example.com" },
        startTime: 110,
        type: "before",
      },
      { callId: "c1", endTime: 160, type: "after" },
      {
        callId: "c2",
        class: "Page",
        method: "mouseWheel",
        params: { deltaX: 0, deltaY: 700 },
        startTime: 170,
        type: "before",
      },
      { callId: "c2", endTime: 175, type: "after" },
      {
        callId: "g2",
        class: "Tracing",
        method: "tracingGroup",
        startTime: 200,
        title: "submit",
        type: "before",
      },
      {
        callId: "c3",
        class: "Frame",
        method: "click",
        params: { selector: "#go" },
        startTime: 210,
        type: "before",
      },
      { callId: "c3", endTime: 230, error: { message: "boom" }, type: "after" },
    ]);

    const { byStep, total } = parseTraceActions(zip);

    expect(total).toBe(3);
    expect(byStep["open-home"]?.map((a) => a.apiName)).toEqual([
      "Frame.goto",
      "Page.mouseWheel",
    ]);
    // goto: url surfaced, noise dropped, duration paired by callId
    const goto = byStep["open-home"]?.[0];
    expect(goto?.params).toBe("https://example.com");
    expect(goto?.durationMs).toBe(50);
    // mouseWheel: deltas summarized
    expect(byStep["open-home"]?.[1]?.params).toContain("deltaY");
    // submit step: click recorded with its error + duration
    expect(byStep.submit?.[0]?.apiName).toBe("Frame.click");
    expect(byStep.submit?.[0]?.error).toBe("boom");
    expect(byStep.submit?.[0]?.durationMs).toBe(20);
  });

  it("returns empty for non-zip / garbage input", () => {
    expect(parseTraceActions(new Uint8Array([1, 2, 3, 4]))).toEqual({
      byStep: {},
      total: 0,
    });
  });

  it("returns empty when the zip has no trace.trace entry", () => {
    const zip = zipSync({ "other.txt": strToU8("hello") });
    expect(parseTraceActions(zip)).toEqual({ byStep: {}, total: 0 });
  });
});
