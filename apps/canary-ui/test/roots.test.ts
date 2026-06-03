import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRoot,
  getRootById,
  loadRoots,
  removeRoot,
  rootIdFor,
} from "../lib/roots";

describe("rootIdFor", () => {
  it("is stable, path-normalized, and distinct per path", () => {
    expect(rootIdFor("/a/b")).toBe(rootIdFor("/a/b/"));
    expect(rootIdFor("/a/b")).not.toBe(rootIdFor("/a/c"));
    expect(rootIdFor("/a/b")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("roots registry (CANARY_DIR-isolated)", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "canary-home-"));
    process.env.CANARY_DIR = home;
  });
  afterEach(async () => {
    Reflect.deleteProperty(process.env, "CANARY_DIR");
    Reflect.deleteProperty(process.env, "CANARY_UI_ROOT");
    await rm(home, { force: true, recursive: true });
  });

  it("always seeds the default sessions root", async () => {
    const { lastRootId, roots } = await loadRoots();
    expect(roots.some((r) => r.isDefault)).toBe(true);
    expect(roots.find((r) => r.id === lastRootId)).toBeDefined();
  });

  it("adds a labeled root and removes it; the allowlist gates resolution", async () => {
    // addRoot only accepts an existing directory (a registered root becomes a
    // readable base for the artifact route), so register the temp home itself.
    const added = await addRoot(home, "Archive");
    expect((await getRootById(added.id))?.label).toBe("Archive");
    expect(await getRootById("deadbeefcafe")).toBeNull();
    await removeRoot(added.id);
    expect(await getRootById(added.id)).toBeNull();
  });

  it("rejects a path that is not an existing directory", async () => {
    await expect(addRoot(path.join(home, "does-not-exist"))).rejects.toThrow(
      /directory/
    );
  });

  it("selects CANARY_UI_ROOT (the --dir launch root) by default", async () => {
    process.env.CANARY_UI_ROOT = "/tmp/launch-root";
    const { lastRootId, roots } = await loadRoots();
    expect(roots.find((r) => r.id === lastRootId)?.path).toBe(
      path.resolve("/tmp/launch-root")
    );
  });
});
