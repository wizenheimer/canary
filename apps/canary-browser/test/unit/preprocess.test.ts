import { describe, expect, it } from "vitest";
import { preprocessArgs } from "../../src/commands/preprocess.js";

describe("preprocessArgs (--connect optional value)", () => {
  it("passes through when no flags present", () => {
    expect(preprocessArgs(["node", "canary-browser", "run", "x.js"])).toEqual([
      "node",
      "canary-browser",
      "run",
      "x.js",
    ]);
  });

  it("leaves bare --connect alone at end of argv", () => {
    expect(preprocessArgs(["node", "canary-browser", "--connect"])).toEqual([
      "node",
      "canary-browser",
      "--connect",
    ]);
  });

  it("splices --connect URL into --connect=URL", () => {
    expect(
      preprocessArgs([
        "node",
        "canary-browser",
        "--connect",
        "http://localhost:9222",
      ])
    ).toEqual(["node", "canary-browser", "--connect=http://localhost:9222"]);
  });

  it("leaves bare --connect alone when next arg starts with -", () => {
    expect(
      preprocessArgs(["node", "canary-browser", "--connect", "--headless"])
    ).toEqual(["node", "canary-browser", "--connect", "--headless"]);
  });

  it("consumes a following subcommand name as the value (lexical-only rule)", () => {
    expect(
      preprocessArgs(["node", "canary-browser", "--connect", "run", "x.js"])
    ).toEqual(["node", "canary-browser", "--connect=run", "x.js"]);
  });

  it("only splices the first --connect", () => {
    expect(
      preprocessArgs([
        "node",
        "canary-browser",
        "--connect",
        "first",
        "--connect",
        "second",
      ])
    ).toEqual([
      "node",
      "canary-browser",
      "--connect=first",
      "--connect=second",
    ]);
  });

  it("returns shorter slices unchanged", () => {
    expect(preprocessArgs([])).toEqual([]);
    expect(preprocessArgs(["node"])).toEqual(["node"]);
  });
});
