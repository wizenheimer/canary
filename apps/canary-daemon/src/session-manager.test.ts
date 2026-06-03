import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@usecanary/logger";
import type { SessionStartRequest } from "@usecanary/protocol";
import type { ConsoleMessage } from "playwright";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  BrowserEntry,
  BrowserManager,
  SessionLaunchOptions,
} from "./browser-manager.js";
import { getSessionDir } from "./local-endpoint.js";
import { SessionManager, sessionBrowserName } from "./session-manager.js";

type Listener = (arg: unknown) => void;

const log = createLogger({ level: "silent" });

function makeSession(): {
  entry: BrowserEntry;
  calls: string[];
  emit: (event: string, arg: unknown) => void;
} {
  const calls: string[] = [];
  const listeners = new Map<string, Listener[]>();
  const tracing = {
    group: () => {
      calls.push("tracing.group");
      return Promise.resolve();
    },
    groupEnd: () => {
      calls.push("tracing.groupEnd");
      return Promise.resolve();
    },
    start: () => {
      calls.push("tracing.start");
      return Promise.resolve();
    },
    stop: () => {
      calls.push("tracing.stop");
      return Promise.resolve();
    },
  };
  const context = {
    close: () => {
      calls.push("context.close");
      return Promise.resolve();
    },
    off(event: string, fn: Listener) {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((f) => f !== fn)
      );
    },
    on(event: string, fn: Listener) {
      const arr = listeners.get(event) ?? [];
      arr.push(fn);
      listeners.set(event, arr);
    },
    pages: () => [],
    tracing,
  };
  const browser = { isConnected: () => true };
  const entry = {
    browser,
    context,
    name: sessionBrowserName("s1"),
    pages: new Map(),
  } as unknown as BrowserEntry;
  const emit = (event: string, arg: unknown) => {
    for (const fn of listeners.get(event) ?? []) {
      fn(arg);
    }
  };
  return { calls, emit, entry };
}

function makeManager(
  entry: BrowserEntry,
  calls: string[],
  launched: Array<{ name: string; options: SessionLaunchOptions }>
): BrowserManager {
  return {
    launchSessionBrowser: (name: string, options: SessionLaunchOptions) => {
      launched.push({ name, options });
      return Promise.resolve(entry);
    },
    onBrowserDisconnect: () => undefined,
    screenshotActivePage: () => Promise.resolve(),
    stopBrowser: () => {
      calls.push("stopBrowser");
      return Promise.resolve();
    },
  } as unknown as BrowserManager;
}

function startReq(
  over: Partial<SessionStartRequest> = {}
): SessionStartRequest {
  return {
    capture: { console: true, har: true, trace: true, video: true },
    id: "r1",
    sessionId: "s1",
    type: "session-start",
    ...over,
  } as SessionStartRequest;
}

let tempHome: string;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "canary-session-"));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
});

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalUserProfile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = originalUserProfile;
  }
  await rm(tempHome, { recursive: true, force: true });
});

describe("SessionManager", () => {
  it("launches a capture context and starts tracing", async () => {
    const { entry, calls } = makeSession();
    const launched: Array<{ name: string; options: SessionLaunchOptions }> = [];
    const sessions = new SessionManager(
      makeManager(entry, calls, launched),
      log
    );

    const summary = await sessions.start(startReq());

    expect(summary.sessionId).toBe("s1");
    expect(summary.phase).toBe("active");
    expect(launched).toHaveLength(1);
    expect(launched[0]?.name).toBe("__session__s1");
    expect(launched[0]?.options.record.videoDir).toBeDefined();
    expect(launched[0]?.options.record.har?.path).toContain("network.har");
    expect(launched[0]?.options.profileDirOverride).toContain("profile");
    expect(calls).toContain("tracing.start");
  });

  it("rejects a duplicate session id", async () => {
    const { entry, calls } = makeSession();
    const sessions = new SessionManager(makeManager(entry, calls, []), log);
    await sessions.start(startReq());
    await expect(sessions.start(startReq())).rejects.toThrow(/already exists/);
  });

  it("reconciles a session whose browser disconnects unexpectedly", async () => {
    const { entry, calls } = makeSession();
    let onDisconnect: ((name: string) => void) | undefined;
    const manager = {
      launchSessionBrowser: () => Promise.resolve(entry),
      onBrowserDisconnect: (fn: (name: string) => void) => {
        onDisconnect = fn;
      },
      screenshotActivePage: () => Promise.resolve(),
      stopBrowser: () => {
        calls.push("stopBrowser");
        return Promise.resolve();
      },
    } as unknown as BrowserManager;
    const sessions = new SessionManager(manager, log);
    await sessions.start(startReq());
    expect(sessions.has("s1")).toBe(true);

    // The session's browser crashes out from under the daemon.
    onDisconnect?.(sessionBrowserName("s1"));

    // has()/status must stop reporting it as live so a later execute is
    // rejected instead of fabricating a fake non-session browser.
    expect(sessions.has("s1")).toBe(false);
    expect(sessions.status("s1")).toBeUndefined();
  });

  it("stops tracing before closing the context and writes a manifest", async () => {
    const { entry, calls } = makeSession();
    const sessions = new SessionManager(makeManager(entry, calls, []), log);
    await sessions.start(startReq());

    const result = await sessions.end("s1", "end");

    const stopIdx = calls.indexOf("tracing.stop");
    const closeIdx = calls.indexOf("context.close");
    const dropIdx = calls.indexOf("stopBrowser");
    expect(stopIdx).toBeGreaterThanOrEqual(0);
    expect(stopIdx).toBeLessThan(closeIdx);
    expect(closeIdx).toBeLessThan(dropIdx);

    expect(result.session.phase).toBe("ended");
    expect(result.manifestPath).toBe(
      join(getSessionDir("s1"), "manifest.json")
    );
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    expect(manifest.session.sessionId).toBe("s1");
    expect(manifest.reason).toBe("end");
  });

  it("captures console events as newline-delimited JSON", async () => {
    const { entry, calls, emit } = makeSession();
    const sessions = new SessionManager(makeManager(entry, calls, []), log);
    await sessions.start(startReq());

    const msg = {
      location: () => ({ columnNumber: 2, lineNumber: 1, url: "http://x" }),
      page: () => null,
      text: () => "boom",
      type: () => "error",
    } as unknown as ConsoleMessage;
    emit("console", msg);

    await sessions.end("s1", "end");

    const consoleLog = await readFile(
      join(getSessionDir("s1"), "console.log"),
      "utf8"
    );
    const first = JSON.parse(consoleLog.trim().split("\n")[0] ?? "{}");
    expect(first.kind).toBe("console");
    expect(first.type).toBe("error");
    expect(first.text).toBe("boom");
  });

  it("endAll aborts active sessions and drops them from the registry", async () => {
    const { entry, calls } = makeSession();
    const sessions = new SessionManager(makeManager(entry, calls, []), log);
    await sessions.start(startReq());

    await sessions.endAll();
    // The session is finalized and removed (frees memory + closes the execute
    // guard hole), so it no longer appears in the registry.
    expect(sessions.has("s1")).toBe(false);
    expect(sessions.status("s1")).toBeUndefined();
    expect(calls).toContain("context.close");

    // A second end on a now-unknown session throws (the orchestrator reconciles
    // the on-disk record in that case).
    await expect(sessions.end("s1", "end")).rejects.toThrow(/not found/);
  });

  it("does not record artifacts that capture disabled", async () => {
    const { entry, calls } = makeSession();
    const sessions = new SessionManager(makeManager(entry, calls, []), log);
    await sessions.start(
      startReq({
        capture: { console: false, har: false, trace: false, video: false },
      })
    );
    expect(calls).not.toContain("tracing.start");

    const result = await sessions.end("s1", "end");
    expect(calls).not.toContain("tracing.stop");
    expect(result.artifacts).toHaveLength(0);
  });
});
