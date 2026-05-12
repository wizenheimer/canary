import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat, utimes, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDaemonExtracted } from "../../src/daemon/extract.js";

let tempHome: string;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "cli-ts-extract-"));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  await rm(tempHome, { recursive: true, force: true });
});

describe("ensureDaemonExtracted", () => {
  it("writes daemon.mjs, sandbox-client.js, and package.json under ~/.dev-browser", async () => {
    const daemonPath = await ensureDaemonExtracted();
    expect(daemonPath).toBe(join(tempHome, ".dev-browser", "daemon.mjs"));
    for (const name of ["daemon.mjs", "sandbox-client.js", "package.json"]) {
      const info = await stat(join(tempHome, ".dev-browser", name));
      expect(info.isFile()).toBe(true);
    }
  });

  it("skips rewrite when content matches", async () => {
    await ensureDaemonExtracted();
    const bundlePath = join(tempHome, ".dev-browser", "daemon.mjs");

    const past = new Date(Date.now() - 10_000);
    await utimes(bundlePath, past, past);
    const before = await stat(bundlePath);

    await ensureDaemonExtracted();
    const after = await stat(bundlePath);
    expect(after.mtime.getTime()).toBe(before.mtime.getTime());
  });

  it("rewrites when content is stale", async () => {
    const dir = join(tempHome, ".dev-browser");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "daemon.mjs"), "STALE");
    await ensureDaemonExtracted();
    const text = await readFile(join(dir, "daemon.mjs"), "utf8");
    expect(text).not.toBe("STALE");
    expect(text.length).toBeGreaterThan(100);
  });
});
