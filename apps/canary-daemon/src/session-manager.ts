import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "@usecanary/logger";
import {
  type ArtifactInfo,
  type CaptureOptions,
  SESSION_CONSOLE_FILE,
  SESSION_HAR_FILE,
  SESSION_SCREENSHOT_EXT,
  SESSION_SCREENSHOTS_DIR,
  SESSION_TRACE_FILE,
  SESSION_VIDEO_DIR,
  SESSION_VIDEO_EXT,
  type SessionEndResult,
  type SessionPhase,
  type SessionStartRequest,
  type SessionSummary,
} from "@usecanary/protocol";
import type { ConsoleMessage, Page, WebError } from "playwright";
import type { BrowserEntry, BrowserManager } from "./browser-manager.js";
import { getSessionDir } from "./local-endpoint.js";

// Reserved browser-name prefix. A session is a dedicated capture-enabled
// persistent context registered under this name so the existing `execute`
// path drives it unchanged (just target `__session__<id>`).
const SESSION_PREFIX = "__session__";

// Cap each teardown step so a hung context.close() can't stall daemon exit.
const TEARDOWN_TIMEOUT_MS = 5000;

export function sessionBrowserName(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

type EndReason = "end" | "abort";

interface SessionState {
  artifactsDir: string;
  capture: CaptureOptions;
  consolePath: string;
  consoleStream?: WriteStream;
  endedAt?: number;
  entry: BrowserEntry;
  errorDisposers: Array<() => void>;
  harPath: string;
  headless: boolean;
  name?: string;
  // Last known page count, captured before the context closes (summarize()
  // can't read pages() once the browser disconnects).
  pageCount: number;
  phase: SessionPhase;
  runCount: number;
  sessionId: string;
  startedAt: number;
  videoDir: string;
}

// Owns the daemon-side session registry and all capture wiring (tracing, video,
// HAR, console). Capture targets the daemon's REAL Playwright context only; the
// QuickJS forked client is never involved.
export class SessionManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly manager: BrowserManager;
  private readonly log: Logger;

  constructor(manager: BrowserManager, log: Logger) {
    this.manager = manager;
    this.log = log;
    // Reconcile the registry when a session's browser disconnects out from
    // under us (crash/external kill). Without this, has() keeps reporting the
    // dead session as live and a later execute launches a fake non-session
    // browser under the reserved __session__ prefix.
    this.manager.onBrowserDisconnect((name) =>
      this.handleBrowserDisconnect(name)
    );
  }

  private handleBrowserDisconnect(name: string): void {
    const sessionId = this.sessionIdForBrowser(name);
    if (!sessionId) {
      return;
    }
    const state = this.sessions.get(sessionId);
    // A normal end() sets phase to "ending" before closing the context, so this
    // only fires on an unexpected crash of a still-active session.
    if (state?.phase !== "active") {
      return;
    }
    state.phase = "failed";
    state.endedAt = Date.now();
    // Drop it immediately so has()/status stop reporting it as live and the
    // execute guard rejects a later run instead of fabricating a context.
    this.sessions.delete(sessionId);
    for (const dispose of state.errorDisposers) {
      try {
        dispose();
      } catch {
        // listener already gone
      }
    }
    state.errorDisposers = [];
    // Flush console; the context is gone so tracing can't be finalized — the
    // orchestrator rebuilds the report from artifacts already on disk.
    void this.closeStream(state.consoleStream);
    state.consoleStream = undefined;
    this.log.warn({ sessionId }, "session browser disconnected unexpectedly");
  }

  isSessionBrowser(name: string): boolean {
    return name.startsWith(SESSION_PREFIX);
  }

  sessionIdForBrowser(name: string): string | undefined {
    return name.startsWith(SESSION_PREFIX)
      ? name.slice(SESSION_PREFIX.length)
      : undefined;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  status(sessionId: string): SessionSummary | undefined {
    const state = this.sessions.get(sessionId);
    return state ? this.summarize(state) : undefined;
  }

  list(): SessionSummary[] {
    return Array.from(this.sessions.values()).map((state) =>
      this.summarize(state)
    );
  }

  noteRun(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.runCount += 1;
    }
  }

  async start(req: SessionStartRequest): Promise<SessionSummary> {
    if (this.sessions.has(req.sessionId)) {
      throw new Error(`Session "${req.sessionId}" already exists`);
    }

    const artifactsDir = getSessionDir(req.sessionId);
    const profileDir = path.join(artifactsDir, "profile");
    const videoDir = path.join(artifactsDir, SESSION_VIDEO_DIR);
    const harPath = path.join(artifactsDir, SESSION_HAR_FILE);
    const consolePath = path.join(artifactsDir, SESSION_CONSOLE_FILE);
    await mkdir(profileDir, { recursive: true });

    const entry = await this.manager.launchSessionBrowser(
      sessionBrowserName(req.sessionId),
      {
        headless: req.headless ?? false,
        ignoreHTTPSErrors: req.ignoreHTTPSErrors ?? false,
        profileDirOverride: profileDir,
        record: {
          videoDir: req.capture.video ? videoDir : undefined,
          har: req.capture.har
            ? { path: harPath, content: "embed" }
            : undefined,
        },
      }
    );

    const state: SessionState = {
      artifactsDir,
      capture: req.capture,
      consolePath,
      entry,
      errorDisposers: [],
      harPath,
      headless: req.headless ?? false,
      name: req.name,
      pageCount: 0,
      phase: "active",
      runCount: 0,
      sessionId: req.sessionId,
      startedAt: Date.now(),
      videoDir,
    };

    // launchSessionBrowser already registered the capture context. If the
    // remaining setup throws, tear that context down rather than leaking an
    // untracked recording browser that SessionManager can never reach (it would
    // otherwise survive until daemon shutdown).
    try {
      if (req.capture.trace) {
        await entry.context.tracing.start({
          screenshots: true,
          snapshots: true,
          sources: true,
          title: req.name ?? req.sessionId,
        });
      }
      if (req.capture.console) {
        this.attachConsole(state);
      }
    } catch (err) {
      await this.swallow(() => this.manager.stopBrowser(entry.name));
      throw err;
    }

    this.sessions.set(req.sessionId, state);
    this.log.info(
      { sessionId: req.sessionId, artifactsDir },
      "session started"
    );
    return this.summarize(state);
  }

  async beginStep(sessionId: string, step: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state?.capture.trace) {
      await state.entry.context.tracing.group(step).catch(() => undefined);
    }
  }

  async endStep(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state?.capture.trace) {
      await state.entry.context.tracing.groupEnd().catch(() => undefined);
    }
  }

  // Strict teardown ordering: stop tracing (writes trace.zip) -> close context
  // (flushes *.webm + finalizes HAR) -> detach listeners + flush console stream
  // -> enumerate artifacts + write manifest.json -> drop the session browser.
  async end(sessionId: string, reason: EndReason): Promise<SessionEndResult> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Session "${sessionId}" not found`);
    }
    // Re-entry on an already-terminal session (e.g. a retry after a crash, or
    // endAll() reaching a session that crashed). Still stop the browser and drop
    // the registry entry in a finally so a collect() failure can't leak the
    // session browser.
    if (state.phase !== "active") {
      try {
        return await this.collect(state, reason);
      } finally {
        await this.swallow(() => this.manager.stopBrowser(state.entry.name));
        this.sessions.delete(sessionId);
      }
    }

    state.phase = "ending";
    const ctx = state.entry.context;

    // Capture the live page count BEFORE closing — summarize() can't read
    // pages() once the browser disconnects, so the manifest would record 0.
    if (state.entry.browser.isConnected()) {
      state.pageCount = ctx.pages().length;
    }

    // Flush artifacts FULLY — await directly (no timeout race) so trace.zip,
    // *.webm and the HAR are completely written before collect() enumerates
    // them. A wedged teardown only matters at daemon shutdown, where endAll()
    // wraps end() in a bounded best() so exit can't hang.
    if (state.capture.trace) {
      await this.swallow(() =>
        ctx.tracing.stop({ path: path.join(state.artifactsDir, "trace.zip") })
      );
    }
    await this.swallow(() => ctx.close());

    for (const dispose of state.errorDisposers) {
      try {
        dispose();
      } catch {
        // listener already gone
      }
    }
    state.errorDisposers = [];
    await this.closeStream(state.consoleStream);
    state.consoleStream = undefined;

    // Finalize phase BEFORE collecting so the manifest reflects ended/aborted.
    state.phase = reason === "abort" ? "aborted" : "ended";
    state.endedAt = Date.now();

    // Always stop the browser and drop the session, even if collect() throws
    // (e.g. a manifest write failure) — otherwise the __session__ browser leaks
    // in BrowserManager with no session entry left to reach it.
    try {
      const result = await this.collect(state, reason);
      this.log.info({ sessionId, reason }, "session ended");
      return result;
    } finally {
      await this.swallow(() => this.manager.stopBrowser(state.entry.name));
      // Drop the session: frees the registry and closes the execute guard hole
      // (a later execute on this name is rejected instead of launching a fake
      // non-session browser under the reserved __session__ prefix).
      this.sessions.delete(sessionId);
    }
  }

  async endAll(): Promise<void> {
    for (const sessionId of Array.from(this.sessions.keys())) {
      await this.best(() => this.end(sessionId, "abort"));
    }
  }

  private attachConsole(state: SessionState): void {
    const stream = createWriteStream(state.consolePath, { flags: "a" });
    // A WriteStream with no 'error' listener throws as an uncaught exception on
    // an async write failure (ENOSPC/EPIPE), which would crash the whole daemon
    // and every other session. Swallow it — losing a console line must not.
    stream.on("error", (err) => {
      this.log.debug(
        { err, sessionId: state.sessionId },
        "console log stream error"
      );
    });
    state.consoleStream = stream;
    const ctx = state.entry.context;

    const write = (record: Record<string, unknown>) => {
      if (!stream.destroyed) {
        stream.write(`${JSON.stringify(record)}\n`);
      }
    };

    const onConsole = (msg: ConsoleMessage) => {
      const loc = msg.location();
      write({
        ts: Date.now(),
        kind: "console",
        type: msg.type(),
        text: msg.text(),
        url: loc.url,
        line: loc.lineNumber,
        col: loc.columnNumber,
        page: this.namePage(state, msg.page()),
      });
    };
    ctx.on("console", onConsole);
    state.errorDisposers.push(() => ctx.off("console", onConsole));

    // weberror is the context-level aggregation of every page's uncaught
    // error, including pages opened later — no per-page wiring needed.
    const onWebError = (webError: WebError) => {
      const err = webError.error();
      write({
        ts: Date.now(),
        kind: "pageerror",
        message: err?.message ?? String(err),
        stack: err?.stack,
        page: this.namePage(state, webError.page()),
      });
    };
    ctx.on("weberror", onWebError);
    state.errorDisposers.push(() => ctx.off("weberror", onWebError));
  }

  private namePage(state: SessionState, page: Page | null): string | undefined {
    if (!page) {
      return;
    }
    for (const [name, candidate] of state.entry.pages) {
      if (candidate === page) {
        return name;
      }
    }
    return;
  }

  private async collect(
    state: SessionState,
    reason: EndReason
  ): Promise<SessionEndResult> {
    const artifacts: ArtifactInfo[] = [];
    const add = async (kind: ArtifactInfo["kind"], filePath: string) => {
      try {
        const info = await stat(filePath);
        if (info.isFile()) {
          artifacts.push({ kind, path: filePath, bytes: info.size });
        }
      } catch {
        // missing/partial artifact — leave it out of the manifest
      }
    };

    if (state.capture.trace) {
      await add("trace", path.join(state.artifactsDir, SESSION_TRACE_FILE));
    }
    if (state.capture.har) {
      await add("har", state.harPath);
    }
    if (state.capture.console) {
      await add("console", state.consolePath);
    }
    if (state.capture.video) {
      const files = await readdir(state.videoDir).catch(() => [] as string[]);
      for (const file of files) {
        if (file.endsWith(SESSION_VIDEO_EXT)) {
          await add("video", path.join(state.videoDir, file));
        }
      }
    }
    const screenshotsDir = path.join(
      state.artifactsDir,
      SESSION_SCREENSHOTS_DIR
    );
    const shots = await readdir(screenshotsDir).catch(() => [] as string[]);
    for (const file of shots) {
      if (file.endsWith(SESSION_SCREENSHOT_EXT)) {
        await add("screenshot", path.join(screenshotsDir, file));
      }
    }

    const session = this.summarize(state);
    const manifestPath = path.join(state.artifactsDir, "manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ session, artifacts, reason }, null, 2)
    );
    return { session, artifacts, manifestPath };
  }

  private summarize(state: SessionState): SessionSummary {
    // Live count while the browser is up; the value captured at end() time once
    // it has disconnected (so an ended session reports its real page count, not 0).
    const pageCount = state.entry.browser.isConnected()
      ? state.entry.context.pages().length
      : state.pageCount;
    return {
      artifactsDir: state.artifactsDir,
      browser: state.entry.name,
      capture: state.capture,
      endedAt: state.endedAt,
      headless: state.headless,
      name: state.name,
      pageCount,
      phase: state.phase,
      runCount: state.runCount,
      sessionId: state.sessionId,
      startedAt: state.startedAt,
    };
  }

  // Await a teardown step to completion, logging (not throwing) on failure.
  // Used by end() so artifacts are fully flushed before enumeration.
  private async swallow(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.log.debug({ err }, "session teardown step failed");
    }
  }

  // Like swallow(), but bounded by a timeout so a wedged context.close() can't
  // stall daemon shutdown. Used only by endAll(); the losing promise's eventual
  // rejection is consumed by Promise.race, so it never becomes unhandled.
  private async best(fn: () => Promise<unknown>): Promise<void> {
    try {
      await Promise.race([
        fn(),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, TEARDOWN_TIMEOUT_MS);
          timer.unref();
        }),
      ]);
    } catch (err) {
      this.log.debug({ err }, "session teardown step failed");
    }
  }

  private closeStream(stream?: WriteStream): Promise<void> {
    if (!stream) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      stream.end(() => resolve());
    });
  }
}
