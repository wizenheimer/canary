import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { BrowserManager } from "./browser-manager.js";
import { removeDirectoryWithRetries } from "./test-cleanup.js";

const browserName = "init-script-integration";

function createDataUrl(title: string, body: string): string {
  return `data:text/html,${encodeURIComponent(`<title>${title}</title>${body}`)}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../test-fixtures/rrweb");

describe.sequential("BrowserManager init-script integration (real Chromium)", () => {
  let browserRootDir = "";
  let manager: BrowserManager;

  beforeAll(async () => {
    browserRootDir = await mkdtemp(path.join(os.tmpdir(), "dvb-init-script-int-"));
    manager = new BrowserManager(path.join(browserRootDir, "browsers"));
  }, 180_000);

  afterEach(async () => {
    await manager.stopBrowser(browserName);
  }, 180_000);

  afterAll(async () => {
    await manager.stopAll();
    await removeDirectoryWithRetries(browserRootDir);
  }, 180_000);

  it("evaluates the inject script before any page JS runs", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ['window.__inject_marker = "hi";']);

    const page = await manager.newPage(browserName);
    await page.goto(createDataUrl("t", "<p>hello</p>"));

    const value = await page.evaluate(
      () => (window as { __inject_marker?: string }).__inject_marker
    );
    expect(value).toBe("hi");
  }, 120_000);

  it("persists the inject script across new pages on the same browser", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ['window.__inject_marker = "persist";']);

    const first = await manager.newPage(browserName);
    await first.goto(createDataUrl("a", "<p>a</p>"));
    const firstValue = await first.evaluate(
      () => (window as { __inject_marker?: string }).__inject_marker
    );

    const second = await manager.newPage(browserName);
    await second.goto(createDataUrl("b", "<p>b</p>"));
    const secondValue = await second.evaluate(
      () => (window as { __inject_marker?: string }).__inject_marker
    );

    expect(firstValue).toBe("persist");
    expect(secondValue).toBe("persist");
  }, 120_000);

  it("does not double-register a script when the same content is applied twice", async () => {
    await manager.ensureBrowser(browserName, { headless: true });

    // Increments a counter every time it runs. If the script were registered
    // twice, the counter would be 2 after a single page load.
    const counter = "window.__count = (window.__count ?? 0) + 1;";
    await manager.applyInitScripts(browserName, [counter]);
    await manager.applyInitScripts(browserName, [counter]);

    const page = await manager.newPage(browserName);
    await page.goto(createDataUrl("t", "<p>once</p>"));
    const count = await page.evaluate(() => (window as { __count?: number }).__count);
    expect(count).toBe(1);
  }, 120_000);

  it("a script that throws at page-load time still applies cleanly", async () => {
    // Playwright's addInitScript only fails for installation-side errors
    // (CDP transport, invalid context, etc.) — script *evaluation* errors
    // happen on the page after navigation and surface in the page's
    // console, not back through addInitScript. We assert applyInitScripts
    // resolves cleanly and the user script can still drive the page.
    await manager.ensureBrowser(browserName, { headless: true });

    // Setting __ran=true before the throw lets us prove the script
    // executed up to the throw — i.e. it was registered and evaluated.
    const throwing = 'window.__ran = true; throw new Error("inject boom");';
    await expect(manager.applyInitScripts(browserName, [throwing])).resolves.toBeUndefined();

    const page = await manager.newPage(browserName);
    await page.goto(createDataUrl("t", "<p>hello</p>"));

    const ran = await page.evaluate(() => (window as { __ran?: boolean }).__ran);
    expect(ran).toBe(true);

    // Page is otherwise responsive — a throwing init script doesn't
    // break subsequent automation.
    expect(await page.title()).toBe("t");
  }, 120_000);

  it("applies init scripts additively across calls", async () => {
    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, ['window.__a = "a";']);
    await manager.applyInitScripts(browserName, ['window.__b = "b";']);

    const page = await manager.newPage(browserName);
    await page.goto(createDataUrl("t", "<p>add</p>"));

    const both = await page.evaluate(() => ({
      a: (window as { __a?: string }).__a,
      b: (window as { __b?: string }).__b,
    }));
    expect(both).toEqual({ a: "a", b: "b" });
  }, 120_000);

  it("rrweb captures a FullSnapshot before page JS mutates the DOM", async () => {
    const rrwebBundle = await readFile(path.join(FIXTURES, "rrweb-record.min.js"), "utf8");

    // Playwright wraps addInitScript source in `(() => { ... })()`, so the
    // bundle's top-level `var rrwebRecord` is scoped to that IIFE — call it
    // directly (in-scope) rather than via window.
    const initScript = `${rrwebBundle}
window.__events = [];
rrwebRecord({ emit: function(e){ window.__events.push(e); } });`;

    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, [initScript]);

    const page = await manager.newPage(browserName);
    await page.goto(createDataUrl("rrweb-snapshot", '<div id="x">hello</div>'));

    // Wait for rrweb's FullSnapshot to land. rrweb takes the snapshot on
    // DOMContentLoaded — if our injection ran late (after DOMContentLoaded),
    // no FullSnapshot is emitted and this times out.
    await page.waitForFunction(
      () => {
        const e = (window as { __events?: Array<{ type: number }> }).__events;
        return Array.isArray(e) && e.some((event) => event.type === 2);
      },
      undefined,
      { timeout: 10_000 }
    );

    // Mutate the DOM post-load via evaluate. rrweb's MutationObserver should
    // emit an IncrementalSnapshot (type 3). Absence would mean rrweb hooked
    // before the FullSnapshot but never attached its observer.
    await page.evaluate(() => {
      const el = document.getElementById("x");
      if (el) el.textContent = "world";
    });

    await page.waitForFunction(
      () => {
        const e = (window as { __events?: Array<{ type: number }> }).__events;
        return Array.isArray(e) && e.some((event) => event.type === 3);
      },
      undefined,
      { timeout: 10_000 }
    );

    const events = (await page.evaluate(
      () => (window as { __events?: Array<{ type: number }> }).__events ?? []
    )) as Array<{ type: number }>;

    // FullSnapshot (2) proves rrweb hooked the page before/at DOMContentLoaded;
    // IncrementalSnapshot (3) proves the MutationObserver was wired up before
    // the post-load mutation fired. Together: init script ran at the right
    // phase and rrweb's full instrumentation is active.
    expect(events.some((event) => event.type === 2)).toBe(true);
    expect(events.some((event) => event.type === 3)).toBe(true);

    // First event must be a load-lifecycle type (Meta=4, DomContentLoaded=0,
    // Load=1, FullSnapshot=2). A first event of type 3 would mean rrweb
    // attached mid-stream and missed the initial DOM.
    expect([0, 1, 2, 4]).toContain(events[0]?.type);
  }, 180_000);

  it("rrweb hook persists into a second page on the same browser", async () => {
    const rrwebBundle = await readFile(path.join(FIXTURES, "rrweb-record.min.js"), "utf8");
    // Playwright wraps addInitScript source in `(() => { ... })()`, so the
    // bundle's top-level `var rrwebRecord` is scoped to that IIFE — call it
    // directly (in-scope) rather than via window.
    const initScript = `${rrwebBundle}
window.__events = [];
rrwebRecord({ emit: function(e){ window.__events.push(e); } });`;

    await manager.ensureBrowser(browserName, { headless: true });
    await manager.applyInitScripts(browserName, [initScript]);

    const first = await manager.newPage(browserName);
    await first.goto(createDataUrl("a", "<p>first</p>"));
    await first.waitForFunction(
      () => ((window as { __events?: unknown[] }).__events?.length ?? 0) > 0,
      undefined,
      { timeout: 10_000 }
    );

    const second = await manager.newPage(browserName);
    await second.goto(createDataUrl("b", "<p>second</p>"));
    await second.waitForFunction(
      () => ((window as { __events?: unknown[] }).__events?.length ?? 0) > 0,
      undefined,
      { timeout: 10_000 }
    );

    const secondEvents = (await second.evaluate(
      () => (window as { __events?: Array<{ type: number }> }).__events ?? []
    )) as Array<{ type: number }>;

    expect(secondEvents.length).toBeGreaterThan(0);
    expect(secondEvents.some((event) => event.type === 2)).toBe(true);
  }, 180_000);
});
