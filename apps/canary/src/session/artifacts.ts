import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { sessionDir, sessionManifestPath } from "@canary/daemon-client";
import {
  type ArtifactInfo,
  SESSION_CONSOLE_FILE,
  SESSION_HAR_FILE,
  SESSION_SCREENSHOT_EXT,
  SESSION_SCREENSHOTS_DIR,
  SESSION_TRACE_FILE,
  SESSION_VIDEO_DIR,
  SESSION_VIDEO_EXT,
  type SessionEndResult,
  type SessionPhase,
} from "@canary/protocol";
import type { SessionRecord } from "./registry.js";

async function statRef(
  kind: ArtifactInfo["kind"],
  filePath: string
): Promise<ArtifactInfo | undefined> {
  try {
    const info = await stat(filePath);
    if (info.isFile()) {
      return { bytes: info.size, kind, path: filePath };
    }
  } catch {
    // missing artifact
  }
  return;
}

async function dirArtifacts(
  kind: ArtifactInfo["kind"],
  dir: string,
  suffix: string
): Promise<ArtifactInfo[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  const refs = await Promise.all(
    files
      .filter((f) => f.endsWith(suffix))
      .map((f) => statRef(kind, path.join(dir, f)))
  );
  return refs.filter((r): r is ArtifactInfo => r !== undefined);
}

// Reconstruct a SessionEndResult by scanning the session dir on disk. Used when
// the daemon can no longer finalize the session (restarted / lost it) but the
// artifacts it already flushed remain — so `session end`/`abort` can still emit
// a report instead of leaving a zombie record.
export async function endResultFromDisk(
  record: SessionRecord
): Promise<SessionEndResult> {
  const dir = sessionDir(record.id);
  const refs = await Promise.all([
    statRef("trace", path.join(dir, SESSION_TRACE_FILE)),
    statRef("har", path.join(dir, SESSION_HAR_FILE)),
    statRef("console", path.join(dir, SESSION_CONSOLE_FILE)),
  ]);
  const [videos, screenshots] = await Promise.all([
    dirArtifacts("video", path.join(dir, SESSION_VIDEO_DIR), SESSION_VIDEO_EXT),
    dirArtifacts(
      "screenshot",
      path.join(dir, SESSION_SCREENSHOTS_DIR),
      SESSION_SCREENSHOT_EXT
    ),
  ]);
  const artifacts = [
    ...refs.filter((r): r is ArtifactInfo => r !== undefined),
    ...videos,
    ...screenshots,
  ];

  const phase: SessionPhase = record.status === "aborted" ? "aborted" : "ended";
  return {
    artifacts,
    manifestPath: sessionManifestPath(record.id),
    session: {
      artifactsDir: dir,
      browser: record.browser,
      capture: record.capture,
      endedAt: Date.parse(record.endedAt ?? "") || Date.now(),
      headless: record.headless,
      name: record.name,
      pageCount: 0,
      phase,
      runCount: record.steps.length,
      sessionId: record.id,
      startedAt: Date.parse(record.createdAt) || Date.now(),
    },
  };
}
