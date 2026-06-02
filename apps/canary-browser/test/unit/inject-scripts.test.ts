import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectInjectScriptPaths,
  parseInjectScriptEnv,
  readInjectScripts,
} from "../../src/inject-scripts.js";

describe("parseInjectScriptEnv", () => {
  it("returns [] for undefined and empty", () => {
    expect(parseInjectScriptEnv(undefined)).toEqual([]);
    expect(parseInjectScriptEnv("")).toEqual([]);
  });

  it("splits on commas, trims, drops empties", () => {
    expect(parseInjectScriptEnv("a.js, b.js ,,c.js")).toEqual([
      "a.js",
      "b.js",
      "c.js",
    ]);
  });

  it("splits on newlines as well", () => {
    expect(parseInjectScriptEnv("a.js\nb.js\n\nc.js")).toEqual([
      "a.js",
      "b.js",
      "c.js",
    ]);
  });

  it("drops whitespace-only entries", () => {
    expect(parseInjectScriptEnv(" , \t , \n")).toEqual([]);
  });
});

describe("collectInjectScriptPaths", () => {
  it("returns env entries first, then flag entries in argv order", () => {
    expect(
      collectInjectScriptPaths("env-a.js,env-b.js", ["flag-a.js", "flag-b.js"])
    ).toEqual(["env-a.js", "env-b.js", "flag-a.js", "flag-b.js"]);
  });

  it("works with only flags", () => {
    expect(collectInjectScriptPaths(undefined, ["a.js"])).toEqual(["a.js"]);
  });

  it("works with only env", () => {
    expect(collectInjectScriptPaths("a.js", [])).toEqual(["a.js"]);
  });

  it("returns [] when both are empty", () => {
    expect(collectInjectScriptPaths(undefined, [])).toEqual([]);
  });

  it("does not de-dupe — the daemon hashes content and dedupes server-side", () => {
    expect(collectInjectScriptPaths("a.js", ["a.js"])).toEqual([
      "a.js",
      "a.js",
    ]);
  });
});

describe("readInjectScripts", () => {
  let workdir = "";

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), "cli-ts-inject-scripts-"));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it("reads each file's contents in order", async () => {
    await writeFile(path.join(workdir, "a.js"), "console.log('a');");
    await writeFile(path.join(workdir, "b.js"), "console.log('b');");

    const contents = await readInjectScripts(["a.js", "b.js"], workdir);
    expect(contents).toEqual(["console.log('a');", "console.log('b');"]);
  });

  it("resolves relative paths against the supplied cwd", async () => {
    await writeFile(path.join(workdir, "rel.js"), "REL");

    const contents = await readInjectScripts(["rel.js"], workdir);
    expect(contents).toEqual(["REL"]);
  });

  it("accepts absolute paths as-is", async () => {
    const abs = path.join(workdir, "abs.js");
    await writeFile(abs, "ABS");

    const contents = await readInjectScripts([abs], "/some/other/cwd");
    expect(contents).toEqual(["ABS"]);
  });

  it("allows empty files (passes through as empty strings)", async () => {
    await writeFile(path.join(workdir, "empty.js"), "");

    const contents = await readInjectScripts(["empty.js"], workdir);
    expect(contents).toEqual([""]);
  });

  it("returns [] for an empty path list", async () => {
    expect(await readInjectScripts([], workdir)).toEqual([]);
  });

  it("throws with the offending path on read failure", async () => {
    await expect(
      readInjectScripts(["does-not-exist.js"], workdir)
    ).rejects.toThrow(/--inject-script: failed to read does-not-exist\.js/);
  });
});
