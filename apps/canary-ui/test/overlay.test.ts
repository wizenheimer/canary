import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFolder,
  deleteFolder,
  loadOverlay,
  moveSession,
  normalizeFolderPath,
  type Overlay,
  purgeSession,
  renameFolder,
  setNote,
  setTags,
  withOverlay,
} from "../lib/overlay";

const empty = (): Overlay => ({
  assignments: {},
  folders: [],
  notes: {},
  tags: {},
  version: 1,
});

describe("normalizeFolderPath", () => {
  it("trims, collapses slashes, drops edges", () => {
    expect(normalizeFolderPath(" Work / Checkout ")).toBe("Work/Checkout");
    expect(normalizeFolderPath("//a//b//")).toBe("a/b");
  });
  it("rejects empty, dot, and traversal segments", () => {
    expect(normalizeFolderPath("")).toBeNull();
    expect(normalizeFolderPath(".")).toBeNull();
    expect(normalizeFolderPath("a/../b")).toBeNull();
  });
});

describe("overlay mutators", () => {
  it("createFolder materializes ancestors", () => {
    const o = empty();
    createFolder(o, "Work/Checkout");
    expect(o.folders).toEqual(["Work", "Work/Checkout"]);
  });
  it("moveSession assigns then unfiles", () => {
    const o = empty();
    moveSession(o, "s1", "A/B");
    expect(o.assignments.s1).toBe("A/B");
    expect(o.folders).toContain("A");
    moveSession(o, "s1", null);
    expect(o.assignments.s1).toBeUndefined();
  });
  it("renameFolder rewrites the folder and its assignments", () => {
    const o = empty();
    moveSession(o, "s1", "Old/Sub");
    renameFolder(o, "Old", "New");
    expect(o.assignments.s1).toBe("New/Sub");
    expect(o.folders).toContain("New/Sub");
    expect(o.folders).not.toContain("Old");
  });
  it("deleteFolder unfiles sessions within it", () => {
    const o = empty();
    moveSession(o, "s1", "X/Y");
    deleteFolder(o, "X");
    expect(o.assignments.s1).toBeUndefined();
    expect(o.folders.some((f) => f.startsWith("X"))).toBe(false);
  });
  it("setTags dedupes/sorts/clears and setNote trims/clears", () => {
    const o = empty();
    setTags(o, "s1", [" b ", "a", "a", ""]);
    expect(o.tags.s1).toEqual(["a", "b"]);
    setTags(o, "s1", []);
    expect(o.tags.s1).toBeUndefined();
    setNote(o, "s1", "  hi  ");
    expect(o.notes.s1).toBe("hi");
    setNote(o, "s1", "   ");
    expect(o.notes.s1).toBeUndefined();
  });
  it("purgeSession drops all entries for an id", () => {
    const o = empty();
    moveSession(o, "s1", "F");
    setTags(o, "s1", ["x"]);
    setNote(o, "s1", "n");
    purgeSession(o, "s1");
    expect(o.assignments.s1).toBeUndefined();
    expect(o.tags.s1).toBeUndefined();
    expect(o.notes.s1).toBeUndefined();
  });
});

describe("withOverlay persistence", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "canary-ov-"));
  });
  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("persists mutations to <root>/.canary-ui.json", async () => {
    await withOverlay(dir, (o) => {
      createFolder(o, "A");
      moveSession(o, "s1", "A");
    });
    const reloaded = await loadOverlay(dir);
    expect(reloaded.folders).toContain("A");
    expect(reloaded.assignments.s1).toBe("A");
    const raw = JSON.parse(
      await readFile(path.join(dir, ".canary-ui.json"), "utf8")
    );
    expect(raw.version).toBe(1);
  });

  it("serializes concurrent writes without losing updates", async () => {
    await Promise.all([
      withOverlay(dir, (o) => createFolder(o, "A")),
      withOverlay(dir, (o) => createFolder(o, "B")),
      withOverlay(dir, (o) => createFolder(o, "C")),
    ]);
    const o = await loadOverlay(dir);
    expect([...o.folders].sort()).toEqual(["A", "B", "C"]);
  });
});
