import { type SessionEndResult, sessionStepSlug } from "@canary/protocol";
import { describe, expect, it } from "vitest";
import type { SessionRecord } from "../session/registry.js";
import { buildManifest } from "./manifest.js";
import type { TraceAction } from "./parse-trace.js";
import { renderReport } from "./render-report.js";

const DIR = "/sessions/s1";
const INJECT = "<script>alert(1)</script>";
// Screenshots are keyed by the step's slug (the daemon writes <slug>.png and
// render-report looks it up by sessionStepSlug(step.name)).
const LOGIN_SLUG = sessionStepSlug("login");

function fixtureManifest(extra?: {
  actionsByStep?: Record<string, TraceAction[]>;
  scripts?: Record<string, string>;
}) {
  const record: SessionRecord = {
    artifactsDir: DIR,
    browser: "__session__s1",
    capture: { console: true, har: true, trace: true, video: false },
    createdAt: "2026-06-02T10:00:00.000Z",
    endedAt: "2026-06-02T10:00:04.000Z",
    headless: true,
    id: "s1",
    name: "checkout",
    schemaVersion: 1,
    status: "ended",
    steps: [
      {
        durationMs: 800,
        exitCode: 0,
        name: "login",
        ok: true,
        startedAt: "2026-06-02T10:00:01.000Z",
      },
      {
        durationMs: 500,
        exitCode: 1,
        name: INJECT,
        ok: false,
        startedAt: "2026-06-02T10:00:02.000Z",
      },
    ],
  };
  const endResult: SessionEndResult = {
    artifacts: [
      { bytes: 1234, kind: "trace", path: `${DIR}/trace.zip` },
      {
        bytes: 900,
        kind: "screenshot",
        path: `${DIR}/screenshots/${LOGIN_SLUG}.png`,
      },
    ],
    manifestPath: `${DIR}/manifest.json`,
    session: {
      artifactsDir: DIR,
      browser: "__session__s1",
      capture: record.capture,
      headless: true,
      pageCount: 0,
      phase: "ended",
      runCount: 2,
      sessionId: "s1",
      startedAt: 0,
    },
  };
  if (extra?.scripts) {
    for (const step of record.steps) {
      const text = extra.scripts[step.name];
      if (text !== undefined) {
        step.script = text;
      }
    }
  }
  return buildManifest({
    actionsByStep: extra?.actionsByStep,
    consoleErrors: 1,
    endResult,
    networkFailures: 1,
    record,
  });
}

describe("renderReport", () => {
  it("renders a self-contained report with key sections", () => {
    const html = renderReport(fixtureManifest(), {
      consoleEntries: [{ kind: "console", text: "kaboom", type: "error" }],
      parsedHar: {
        entries: [
          {
            durationMs: 300,
            method: "POST",
            status: 500,
            url: "http://x/boom",
          },
        ],
        failed: 1,
        slowest: [
          {
            durationMs: 300,
            method: "POST",
            status: 500,
            url: "http://x/boom",
          },
        ],
        total: 3,
      },
      screenshots: { [LOGIN_SLUG]: "data:image/png;base64,AAAA" },
    });

    expect(html).toContain('class="badge failed"');
    expect(html).toContain("login");
    expect(html).toContain("show-trace");
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain("kaboom");
    expect(html).toContain("http://x/boom");
  });

  it("renders the full tab set (summary, screenshots, execution, videos)", () => {
    const html = renderReport(fixtureManifest(), {
      consoleEntries: [],
      parsedHar: { entries: [], failed: 0, slowest: [], total: 0 },
      screenshots: { [LOGIN_SLUG]: "data:image/png;base64,AAAA" },
    });

    expect(html).toContain('data-tab="summary"');
    expect(html).toContain('id="panel-screenshots"');
    expect(html).toContain('id="panel-execution"');
    expect(html).toContain('id="panel-videos"');
    // step screenshot moved into the gallery
    expect(html).toContain('id="shot-main"');
  });

  it("renders the Commands tab with actions, script, and escaping", () => {
    const html = renderReport(
      fixtureManifest({
        actionsByStep: {
          login: [
            {
              apiName: "Frame.goto",
              durationMs: 40,
              params: "https://x/?q=<b>",
            },
          ],
        },
        scripts: {
          login: "await page.goto('/'); // <script>alert(2)</script>",
        },
      }),
      {
        consoleEntries: [],
        parsedHar: { entries: [], failed: 0, slowest: [], total: 0 },
        screenshots: {},
      }
    );
    expect(html).toContain('data-tab="commands"');
    expect(html).toContain('id="panel-commands"');
    expect(html).toContain("Frame.goto");
    expect(html).toContain("await page.goto");
    // injected markup in the script/params is escaped, never emitted raw
    expect(html).not.toContain("<script>alert(2)</script>");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
  });

  it("escapes attacker-influenced content (step names, console text)", () => {
    const html = renderReport(fixtureManifest(), {
      consoleEntries: [{ kind: "pageerror", message: INJECT }],
      parsedHar: { entries: [], failed: 0, slowest: [], total: 0 },
      screenshots: {},
    });
    expect(html).not.toContain(INJECT);
    expect(html).toContain("&lt;script&gt;");
  });
});
