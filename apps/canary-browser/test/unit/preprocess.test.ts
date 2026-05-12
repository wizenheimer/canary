import { describe, expect, it } from "vitest";
import { preprocessArgs } from "../../src/commands/preprocess.js";

// Port of cli-go/cmd/preprocess_test.go.
describe("preprocessArgs (--connect parity)", () => {
  it("passes through when no flags present", () => {
    expect(preprocessArgs(["node", "dev-browser", "run", "x.js"])).toEqual([
      "node",
      "dev-browser",
      "run",
      "x.js",
    ]);
  });

  it("leaves bare --connect alone at end of argv", () => {
    expect(preprocessArgs(["node", "dev-browser", "--connect"])).toEqual([
      "node",
      "dev-browser",
      "--connect",
    ]);
  });

  it("splices --connect URL into --connect=URL", () => {
    expect(preprocessArgs(["node", "dev-browser", "--connect", "http://localhost:9222"])).toEqual([
      "node",
      "dev-browser",
      "--connect=http://localhost:9222",
    ]);
  });

  it("leaves bare --connect alone when next arg starts with -", () => {
    expect(preprocessArgs(["node", "dev-browser", "--connect", "--headless"])).toEqual([
      "node",
      "dev-browser",
      "--connect",
      "--headless",
    ]);
  });

  it("consumes subcommand name as value (lexical-only rule matches clap)", () => {
    expect(preprocessArgs(["node", "dev-browser", "--connect", "run", "x.js"])).toEqual([
      "node",
      "dev-browser",
      "--connect=run",
      "x.js",
    ]);
  });

  it("only splices the first --connect", () => {
    expect(
      preprocessArgs(["node", "dev-browser", "--connect", "first", "--connect", "second"])
    ).toEqual(["node", "dev-browser", "--connect=first", "--connect=second"]);
  });

  it("returns shorter slices unchanged", () => {
    expect(preprocessArgs([])).toEqual([]);
    expect(preprocessArgs(["node"])).toEqual(["node"]);
  });
});
