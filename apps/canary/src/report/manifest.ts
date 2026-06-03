import path from "node:path";
import {
  type CaptureOptions,
  type SessionEndResult,
  sessionStepSlug,
} from "@usecanary/protocol";
import type { SessionRecord } from "../session/registry.js";
import type { TraceAction } from "./parse-trace.js";

export const MANIFEST_VERSION = 1;
const PLAYWRIGHT_VERSION = "1.58.2";

export interface ArtifactRef {
  bytes: number;
  path: string;
}

export interface ManifestArtifacts {
  console?: ArtifactRef;
  har?: ArtifactRef;
  screenshots: Record<string, ArtifactRef>;
  trace?: ArtifactRef;
  videos: ArtifactRef[];
}

export interface ManifestStep {
  actions: TraceAction[];
  durationMs: number;
  exitCode: number;
  name: string;
  screenshot?: string;
  script?: string;
  startedAt: string;
  status: "pass" | "fail";
}

export interface ManifestEnvironment {
  browser: "chromium";
  headless: boolean;
  platform: string;
  playwrightVersion: string;
}

export interface ManifestSummary {
  commandCount: number;
  consoleErrors: number;
  networkFailures: number;
  stepsFailed: number;
  stepsPassed: number;
  stepsTotal: number;
}

// Flat, UI-friendly list of every artifact in a session, with a relative path
// and human label. A future viewer can iterate this without knowing the typed
// `artifacts` shape.
export interface ArtifactListEntry {
  bytes: number;
  kind: "report" | "trace" | "video" | "har" | "console" | "screenshot";
  label: string;
  path: string;
  step?: string;
}

// The canonical, schema-versioned per-session record. Written to results.json so
// a future UI can scan ~/.canary/sessions/*/results.json, list sessions, and
// resolve every artifact (paths are relative to the session dir → portable).
export interface SessionManifest {
  artifactList: ArtifactListEntry[];
  artifacts: ManifestArtifacts;
  capture: CaptureOptions;
  createdAt: string;
  durationMs: number;
  endedAt: string;
  environment: ManifestEnvironment;
  id: string;
  kind: "canary-session-result";
  manifestVersion: number;
  name?: string;
  report?: ArtifactRef;
  status: "passed" | "failed" | "aborted";
  steps: ManifestStep[];
  summary: ManifestSummary;
}

export interface BuildManifestInput {
  actionsByStep?: Record<string, TraceAction[]>;
  consoleErrors: number;
  endResult: SessionEndResult;
  networkFailures: number;
  record: SessionRecord;
}

// Pure fusion of the orchestrator's session.json step log + the daemon's
// artifact metadata + parser-derived counts. Artifact paths are made relative
// to the session dir so the report can link to siblings.
export function buildManifest(input: BuildManifestInput): SessionManifest {
  const { record, endResult, consoleErrors, networkFailures, actionsByStep } =
    input;
  const dir = endResult.session.artifactsDir;
  const rel = (abs: string) => path.relative(dir, abs) || path.basename(abs);

  const artifacts: ManifestArtifacts = { screenshots: {}, videos: [] };
  for (const artifact of endResult.artifacts) {
    const ref: ArtifactRef = {
      bytes: artifact.bytes,
      path: rel(artifact.path),
    };
    switch (artifact.kind) {
      case "trace":
        artifacts.trace = ref;
        break;
      case "har":
        artifacts.har = ref;
        break;
      case "console":
        artifacts.console = ref;
        break;
      case "video":
        artifacts.videos.push(ref);
        break;
      case "screenshot": {
        const slug = path.basename(artifact.path).replace(/\.png$/, "");
        artifacts.screenshots[slug] = ref;
        break;
      }
      default:
        break;
    }
  }

  const steps: ManifestStep[] = record.steps.map((step) => {
    const shot = artifacts.screenshots[sessionStepSlug(step.name)];
    return {
      actions: actionsByStep?.[step.name] ?? [],
      durationMs: step.durationMs,
      exitCode: step.exitCode,
      name: step.name,
      screenshot: shot?.path,
      script: step.script,
      startedAt: step.startedAt,
      status: step.ok ? "pass" : "fail",
    };
  });
  const commandCount = steps.reduce(
    (sum, step) => sum + step.actions.length,
    0
  );

  const slugToName = new Map(
    record.steps.map((s) => [sessionStepSlug(s.name), s.name])
  );
  const artifactList: ArtifactListEntry[] = [];
  if (artifacts.trace) {
    artifactList.push({
      bytes: artifacts.trace.bytes,
      kind: "trace",
      label: "Playwright trace",
      path: artifacts.trace.path,
    });
  }
  artifactList.push(
    ...artifacts.videos.map((v, i) => ({
      bytes: v.bytes,
      kind: "video" as const,
      label: `Video ${i + 1}`,
      path: v.path,
    }))
  );
  if (artifacts.har) {
    artifactList.push({
      bytes: artifacts.har.bytes,
      kind: "har",
      label: "Network HAR",
      path: artifacts.har.path,
    });
  }
  if (artifacts.console) {
    artifactList.push({
      bytes: artifacts.console.bytes,
      kind: "console",
      label: "Console log",
      path: artifacts.console.path,
    });
  }
  for (const [slug, ref] of Object.entries(artifacts.screenshots)) {
    const stepName = slugToName.get(slug) ?? slug;
    artifactList.push({
      bytes: ref.bytes,
      kind: "screenshot",
      label: `Screenshot: ${stepName}`,
      path: ref.path,
      step: stepName,
    });
  }

  const stepsPassed = steps.filter((s) => s.status === "pass").length;
  const stepsFailed = steps.length - stepsPassed;

  // Fall back to Date.now() for unparseable timestamps — Date.parse returns NaN
  // and Math.max(0, NaN) is NaN (not 0), which would serialize to null in
  // results.json and render as "NaNm NaNs" in the report.
  const createdMs = Date.parse(record.createdAt) || Date.now();
  const endedMs = Date.parse(record.endedAt ?? "") || Date.now();

  let status: SessionManifest["status"] = stepsFailed > 0 ? "failed" : "passed";
  if (record.status === "aborted") {
    status = "aborted";
  }

  return {
    artifactList,
    artifacts,
    capture: record.capture,
    createdAt: record.createdAt,
    durationMs: Math.max(0, endedMs - createdMs),
    endedAt: record.endedAt ?? new Date().toISOString(),
    environment: {
      browser: "chromium",
      headless: record.headless,
      platform: process.platform,
      playwrightVersion: PLAYWRIGHT_VERSION,
    },
    id: record.id,
    kind: "canary-session-result",
    manifestVersion: MANIFEST_VERSION,
    name: record.name,
    status,
    steps,
    summary: {
      commandCount,
      consoleErrors,
      networkFailures,
      stepsFailed,
      stepsPassed,
      stepsTotal: steps.length,
    },
  };
}
