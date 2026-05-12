import { describe, expect, it } from "vitest";
import { resolveSelection } from "../../src/commands/install-skill.js";

// Mirror of cli/src/skill.rs tests::* and cli-go skill_test.go.
describe("resolveSelection", () => {
  it("--claude alone -> [0]", () => {
    expect(resolveSelection(true, false, true)).toEqual({
      kind: "explicit",
      indexes: [0],
    });
  });

  it("--agents alone -> [1]", () => {
    expect(resolveSelection(false, true, true)).toEqual({
      kind: "explicit",
      indexes: [1],
    });
  });

  it("--claude --agents -> [0, 1]", () => {
    expect(resolveSelection(true, true, false)).toEqual({
      kind: "explicit",
      indexes: [0, 1],
    });
  });

  it("no flags + TTY -> prompt", () => {
    expect(resolveSelection(false, false, true)).toEqual({ kind: "prompt" });
  });

  it("no flags + no TTY -> all targets", () => {
    expect(resolveSelection(false, false, false)).toEqual({
      kind: "explicit",
      indexes: [0, 1],
    });
  });
});
