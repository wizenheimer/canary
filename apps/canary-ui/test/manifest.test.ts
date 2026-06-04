import { describe, expect, it } from "vitest";
import { parseManifest } from "../src/lib/manifest";

const good = JSON.stringify({
  artifacts: {},
  id: "x",
  kind: "canary-session-result",
  manifestVersion: 1,
  steps: [],
  summary: {},
});

describe("parseManifest", () => {
  it("accepts a structurally valid manifest", () => {
    expect(parseManifest(good)?.id).toBe("x");
  });
  it("rejects the wrong kind", () => {
    expect(
      parseManifest(JSON.stringify({ ...JSON.parse(good), kind: "other" }))
    ).toBeNull();
  });
  it("rejects malformed JSON", () => {
    expect(parseManifest("{ not json")).toBeNull();
  });
  it("rejects missing required fields", () => {
    expect(
      parseManifest(JSON.stringify({ kind: "canary-session-result" }))
    ).toBeNull();
  });
});
