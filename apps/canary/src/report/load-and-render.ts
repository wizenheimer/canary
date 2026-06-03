import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sessionReportPath, sessionResultsPath } from "@canary/daemon-client";
import {
  SESSION_SCREENSHOT_EXT,
  type SessionEndResult,
} from "@canary/protocol";
import type { SessionRecord } from "../session/registry.js";
import { buildManifest, type SessionManifest } from "./manifest.js";
import { countConsoleErrors, parseConsole } from "./parse-console.js";
import { parseHar } from "./parse-har.js";
import { parseTraceActions, type TraceAction } from "./parse-trace.js";
import { renderReport } from "./render-report.js";

async function readTextMaybe(file?: string): Promise<string> {
  if (!file) {
    return "";
  }
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

// IO seam: read the daemon-produced artifacts off disk (paths from the
// SessionEndResult are absolute), parse HAR + console, build the manifest, and
// render the self-contained report. Missing artifacts degrade gracefully.
export async function finalizeReport(
  record: SessionRecord,
  endResult: SessionEndResult
): Promise<{ html: string; manifest: SessionManifest }> {
  const find = (kind: string) =>
    endResult.artifacts.find((a) => a.kind === kind)?.path;

  const parsedHar = parseHar(await readTextMaybe(find("har")));
  const consoleEntries = parseConsole(await readTextMaybe(find("console")));

  // Reuse the already-captured trace.zip to recover the per-step Playwright
  // action log (only the small trace.trace entry is inflated). Missing or
  // unreadable trace → no actions; the report still renders.
  let actionsByStep: Record<string, TraceAction[]> = {};
  const tracePath = find("trace");
  if (tracePath) {
    try {
      actionsByStep = parseTraceActions(await readFile(tracePath)).byStep;
    } catch {
      // unreadable trace — leave actions empty
    }
  }

  const manifest = buildManifest({
    actionsByStep,
    consoleErrors: countConsoleErrors(consoleEntries),
    endResult,
    networkFailures: parsedHar.failed,
    record,
  });

  const screenshots: Record<string, string> = {};
  for (const artifact of endResult.artifacts) {
    if (artifact.kind !== "screenshot") {
      continue;
    }
    try {
      const buf = await readFile(artifact.path);
      const slug = path.basename(artifact.path, SESSION_SCREENSHOT_EXT);
      screenshots[slug] = `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      // missing screenshot — skip
    }
  }

  const html = renderReport(manifest, {
    consoleEntries,
    parsedHar,
    screenshots,
  });

  // Record the report itself in results.json (added after render so the report
  // doesn't list itself in its own Artifacts tab).
  const reportBytes = Buffer.byteLength(html, "utf8");
  manifest.report = { bytes: reportBytes, path: "report.html" };
  manifest.artifactList.push({
    bytes: reportBytes,
    kind: "report",
    label: "HTML report",
    path: "report.html",
  });

  return { html, manifest };
}

// Build the report and write results.json + report.html for a session. Shared by
// `session end` and `session abort` so the on-disk report layout lives in one
// place. Throws on a render/write failure; callers decide how to surface it.
export async function writeSessionReport(
  id: string,
  record: SessionRecord,
  endResult: SessionEndResult
): Promise<SessionManifest> {
  const { manifest, html } = await finalizeReport(record, endResult);
  await writeFile(
    sessionResultsPath(id),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeFile(sessionReportPath(id), html);
  return manifest;
}
