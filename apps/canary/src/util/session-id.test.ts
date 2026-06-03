import { describe, expect, it } from "vitest";
import { generateSessionId } from "./session-id.js";

// The daemon validates session ids with /^(?!.*\.\.)[A-Za-z0-9._-]+$/ — only
// these chars, no "..". A generated id that violated this would make
// `session start` fail referencing an id the user never typed.
const ALLOWED = /^[A-Za-z0-9._-]+$/;

describe("generateSessionId", () => {
  it("produces a daemon-schema-valid id for adversarial --name values", () => {
    const names = [
      "v1.2..final",
      "release..rc1",
      "..",
      "a...b",
      "login/admin",
      "   ",
      "###",
      "café ☕",
      "..\\..\\etc",
    ];
    for (const name of names) {
      const id = generateSessionId(name);
      expect(id, name).toMatch(ALLOWED);
      expect(id, name).not.toContain("..");
      expect(id.startsWith("."), name).toBe(false);
    }
  });

  it("falls back to a non-empty prefix when the name sanitizes to empty", () => {
    // Empty/whitespace name → "session"; an all-dots name collapses to "" and
    // also falls back to "session".
    expect(generateSessionId(undefined)).toMatch(/^session-/);
    expect(generateSessionId("   ")).toMatch(/^session-/);
    expect(generateSessionId("...")).toMatch(/^session-/);
  });

  it("preserves single dots in an otherwise-valid name", () => {
    expect(generateSessionId("v1.2.final")).toMatch(/^v1\.2\.final-/);
  });
});
