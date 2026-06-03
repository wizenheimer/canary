import { type SessionEndResult, sessionStepSlug } from "@canary/protocol";
import { describe, expect, it } from "vitest";
import type { SessionRecord } from "../session/registry.js";
import { buildManifest } from "./manifest.js";

const DIR = "/sessions/s1";
// The daemon writes screenshots at screenshots/<slug>.png, so the fixture must
// use the same slug the manifest derives from the step name.
const LOGIN_SHOT = `screenshots/${sessionStepSlug("login")}.png`;

function makeRecord(): SessionRecord {
  return {
    artifactsDir: DIR,
    browser: "__session__s1",
    capture: { console: true, har: true, trace: true, video: true },
    createdAt: "2026-06-02T10:00:00.000Z",
    endedAt: "2026-06-02T10:00:05.000Z",
    headless: false,
    id: "s1",
    name: "checkout",
    schemaVersion: 1,
    status: "ended",
    steps: [
      {
        durationMs: 1000,
        exitCode: 0,
        name: "login",
        ok: true,
        startedAt: "2026-06-02T10:00:01.000Z",
      },
      {
        durationMs: 1500,
        exitCode: 1,
        name: "checkout",
        ok: false,
        startedAt: "2026-06-02T10:00:03.000Z",
      },
    ],
  };
}

function makeEndResult(): SessionEndResult {
  return {
    artifacts: [
      { bytes: 1234, kind: "trace", path: `${DIR}/trace.zip` },
      { bytes: 200, kind: "har", path: `${DIR}/network.har` },
      { bytes: 80, kind: "console", path: `${DIR}/console.log` },
      { bytes: 5000, kind: "video", path: `${DIR}/video/abc.webm` },
      { bytes: 900, kind: "screenshot", path: `${DIR}/${LOGIN_SHOT}` },
    ],
    manifestPath: `${DIR}/manifest.json`,
    session: {
      artifactsDir: DIR,
      browser: "__session__s1",
      capture: { console: true, har: true, trace: true, video: true },
      endedAt: 1,
      headless: false,
      name: "checkout",
      pageCount: 1,
      phase: "ended",
      runCount: 2,
      sessionId: "s1",
      startedAt: 0,
    },
  };
}

describe("buildManifest", () => {
  it("fuses steps + artifacts and rolls up the summary", () => {
    const m = buildManifest({
      consoleErrors: 1,
      endResult: makeEndResult(),
      networkFailures: 2,
      record: makeRecord(),
    });
    expect(m.status).toBe("failed");
    expect(m.summary).toMatchObject({
      consoleErrors: 1,
      networkFailures: 2,
      stepsFailed: 1,
      stepsPassed: 1,
      stepsTotal: 2,
    });
    expect(m.artifacts.trace?.path).toBe("trace.zip");
    expect(m.artifacts.videos[0]?.path).toBe("video/abc.webm");
    expect(m.artifacts.screenshots[sessionStepSlug("login")]?.path).toBe(
      LOGIN_SHOT
    );
    expect(m.steps[0]?.screenshot).toBe(LOGIN_SHOT);
    expect(m.steps[1]?.status).toBe("fail");
    expect(m.durationMs).toBe(5000);

    // results.json schema: canonical kind + a flat artifact list a UI can scan.
    expect(m.kind).toBe("canary-session-result");
    const kinds = m.artifactList.map((a) => a.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["trace", "video", "har", "console", "screenshot"])
    );
    const trace = m.artifactList.find((a) => a.kind === "trace");
    expect(trace?.path).toBe("trace.zip");
    expect(trace?.label).toBe("Playwright trace");
    expect(m.artifactList.find((a) => a.kind === "screenshot")?.step).toBe(
      "login"
    );
  });

  it("marks aborted sessions regardless of step outcomes", () => {
    const record = makeRecord();
    record.status = "aborted";
    const m = buildManifest({
      consoleErrors: 0,
      endResult: makeEndResult(),
      networkFailures: 0,
      record,
    });
    expect(m.status).toBe("aborted");
  });

  it("attaches per-step script + trace actions and rolls up commandCount", () => {
    const record = makeRecord();
    const login = record.steps[0];
    if (login) {
      login.script = "await page.goto('/')";
    }
    const m = buildManifest({
      actionsByStep: {
        login: [
          { apiName: "Frame.goto", durationMs: 12, params: "/" },
          { apiName: "Page.click" },
        ],
      },
      consoleErrors: 0,
      endResult: makeEndResult(),
      networkFailures: 0,
      record,
    });
    expect(m.steps[0]?.script).toBe("await page.goto('/')");
    expect(m.steps[0]?.actions.map((a) => a.apiName)).toEqual([
      "Frame.goto",
      "Page.click",
    ]);
    // a step with no matching actionsByStep entry defaults to an empty list
    expect(m.steps[1]?.actions).toEqual([]);
    expect(m.summary.commandCount).toBe(2);
  });
});
