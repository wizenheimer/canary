import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getSessionDetail,
  listSessions,
  listTrash,
  sessionDirFor,
} from "../src/lib/sessions";

function manifestJson(
  id: string,
  createdAt: string,
  extra: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    artifactList: [],
    artifacts: { screenshots: {}, videos: [] },
    capture: { console: false, har: false, trace: false, video: false },
    createdAt,
    durationMs: 10,
    endedAt: createdAt,
    environment: {
      browser: "chromium",
      headless: false,
      platform: "linux",
      playwrightVersion: "1.58.2",
    },
    id,
    kind: "canary-session-result",
    manifestVersion: 1,
    name: id,
    status: "passed",
    steps: [],
    summary: {
      commandCount: 0,
      consoleErrors: 0,
      networkFailures: 0,
      stepsFailed: 0,
      stepsPassed: 1,
      stepsTotal: 1,
    },
    ...extra,
  });
}

async function writeSession(
  root: string,
  id: string,
  createdAt: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await mkdir(path.join(root, id), { recursive: true });
  await writeFile(
    path.join(root, id, "results.json"),
    manifestJson(id, createdAt, extra)
  );
}

describe("listSessions", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "canary-sx-"));
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("finds sessions newest-first and skips dotdirs + invalid manifests", async () => {
    await writeSession(root, "old", "2026-01-01T00:00:00.000Z");
    await writeSession(root, "new", "2026-06-01T00:00:00.000Z");
    await mkdir(path.join(root, ".trash", "trashed"), { recursive: true });
    await writeFile(
      path.join(root, ".trash", "trashed", "results.json"),
      manifestJson("trashed", "2026-06-02T00:00:00.000Z")
    );
    await mkdir(path.join(root, "bad"), { recursive: true });
    await writeFile(path.join(root, "bad", "results.json"), "{ not json");

    const cards = await listSessions(root);
    expect(cards.map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("merges overlay assignments/tags onto cards", async () => {
    await writeSession(root, "s1", "2026-01-01T00:00:00.000Z");
    await writeFile(
      path.join(root, ".canary-ui.json"),
      JSON.stringify({
        assignments: { s1: "Work" },
        folders: ["Work"],
        notes: {},
        tags: { s1: ["smoke"] },
        version: 1,
      })
    );
    const [card] = await listSessions(root);
    expect(card.folder).toBe("Work");
    expect(card.tags).toEqual(["smoke"]);
  });

  it("listTrash reads the .trash dir", async () => {
    await mkdir(path.join(root, ".trash", "t1"), { recursive: true });
    await writeFile(
      path.join(root, ".trash", "t1", "results.json"),
      manifestJson("t1", "2026-01-01T00:00:00.000Z")
    );
    const trashed = await listTrash(root);
    expect(trashed.map((c) => c.id)).toEqual(["t1"]);
  });
});

describe("getSessionDetail", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "canary-sd-"));
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("returns the manifest plus parsed console output", async () => {
    await writeSession(root, "s1", "2026-01-01T00:00:00.000Z", {
      artifacts: {
        console: { bytes: 1, path: "console.log" },
        screenshots: {},
        videos: [],
      },
    });
    await writeFile(
      path.join(root, "s1", "console.log"),
      '{"type":"error","message":"boom"}\n'
    );
    const detail = await getSessionDetail(root, "s1");
    expect(detail?.manifest.id).toBe("s1");
    expect(detail?.console).toHaveLength(1);
    expect(detail?.har.total).toBe(0);
  });

  it("returns null for a missing session and an unsafe id", async () => {
    expect(await getSessionDetail(root, "nope")).toBeNull();
    expect(sessionDirFor(root, "../escape")).toBeNull();
  });
});
