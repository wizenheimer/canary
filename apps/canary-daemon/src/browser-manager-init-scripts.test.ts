import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Browser, BrowserContext } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserManager } from "./browser-manager.js";
import { removeDirectoryWithRetries } from "./test-cleanup.js";

const browserName = "init-scripts-unit";

interface FakeContext {
  addInitScript: ReturnType<typeof vi.fn>;
  context: BrowserContext;
}

function createFakeContext(): FakeContext {
  const addInitScript = vi.fn().mockResolvedValue(undefined);
  const browser = {
    contexts: () => [],
    isConnected: () => true,
    on: () => undefined,
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Browser;

  const context = {
    browser: () => browser,
    addInitScript,
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext;

  return { addInitScript, context };
}

describe("BrowserManager.applyInitScripts", () => {
  let baseDir = "";
  let manager: BrowserManager;
  let fake: FakeContext;
  let launchPersistentContext: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), "dvb-init-scripts-unit-"));
    fake = createFakeContext();
    launchPersistentContext = vi.fn().mockResolvedValue(fake.context);
    manager = new BrowserManager(baseDir, {
      launchPersistentContext:
        launchPersistentContext as unknown as typeof import("playwright").chromium.launchPersistentContext,
    });
  });

  afterEach(async () => {
    await manager.stopAll();
    await removeDirectoryWithRetries(baseDir);
  });

  it("no-ops with an empty list and never touches addInitScript", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, []);
    expect(fake.addInitScript).not.toHaveBeenCalled();
  });

  it("registers each unique script in order", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["a", "b", "c"]);

    expect(fake.addInitScript).toHaveBeenCalledTimes(3);
    expect(fake.addInitScript).toHaveBeenNthCalledWith(1, { content: "a" });
    expect(fake.addInitScript).toHaveBeenNthCalledWith(2, { content: "b" });
    expect(fake.addInitScript).toHaveBeenNthCalledWith(3, { content: "c" });
  });

  it("dedupes scripts that were already applied to the same browser", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["a"]);
    await manager.applyInitScripts(browserName, ["a", "b"]);

    expect(fake.addInitScript).toHaveBeenCalledTimes(2);
    expect(fake.addInitScript).toHaveBeenNthCalledWith(1, { content: "a" });
    expect(fake.addInitScript).toHaveBeenNthCalledWith(2, { content: "b" });
  });

  it("dedupes when the same script appears twice in a single call", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["a", "a", "a"]);
    expect(fake.addInitScript).toHaveBeenCalledTimes(1);
    expect(fake.addInitScript).toHaveBeenCalledWith({ content: "a" });
  });

  it("treats whitespace-only differences as distinct scripts (hash by content)", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["a", "a "]);
    expect(fake.addInitScript).toHaveBeenCalledTimes(2);
  });

  it("resets the dedup set when the browser is stopped and relaunched", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["a"]);
    expect(fake.addInitScript).toHaveBeenCalledTimes(1);

    await manager.stopBrowser(browserName);

    fake = createFakeContext();
    launchPersistentContext.mockResolvedValueOnce(fake.context);

    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["a"]);
    // First call on the fresh context — the stale Set from the old entry
    // must not survive `stopBrowser`. This is the user-facing "stop to
    // clear" contract exposed in --inject-script's long help.
    expect(fake.addInitScript).toHaveBeenCalledTimes(1);
  });

  it("stopBrowser drops the applied-scripts set so subsequent requests re-register", async () => {
    // Distinct from the launch-relaunch test above: this one stops the
    // browser AND verifies that querying the entry post-stop fails
    // (browser is not running) and that a re-`ensureBrowser` starts with
    // an empty Set — a tighter assertion on the "stop to clear" contract.
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["x", "y", "z"]);
    expect(fake.addInitScript).toHaveBeenCalledTimes(3);

    await manager.stopBrowser(browserName);

    await expect(manager.applyInitScripts(browserName, ["x"])).rejects.toThrow(/not running/);

    fake = createFakeContext();
    launchPersistentContext.mockResolvedValueOnce(fake.context);
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ["x", "y", "z"]);
    expect(fake.addInitScript).toHaveBeenCalledTimes(3);
  });

  it("throws when the browser is not running", async () => {
    await expect(manager.applyInitScripts("missing-browser", ["a"])).rejects.toThrow(/not running/);
  });
});
