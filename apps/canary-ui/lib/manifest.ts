// Local, structural mirror of the canary `results.json` schema (the
// `SessionManifest` written by apps/canary/src/report/manifest.ts). The UI owns
// this copy on purpose: the @canary/* packages export only a raw-TS `source`
// condition that Next can't resolve cleanly, and importing them would drag the
// CLI's deps (zod, etc.) into the web bundle.
//
// NOTE: parseManifest validates the structural anchors AND normalizes the
// containers the renderer dereferences (videos/screenshots/steps[].actions/
// capture/summary), so an older/partial/hand-edited results.json can't crash a
// consumer with a `Cannot read properties of undefined` at render time.

export interface ArtifactRef {
  bytes: number;
  path: string;
}

// A single Playwright call recovered from the trace (already baked into
// results.json per step — so the Commands/Execution tabs need no extra files).
export interface TraceAction {
  apiName: string;
  durationMs?: number;
  error?: string;
  params?: string;
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
  browser: string;
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

export interface ArtifactListEntry {
  bytes: number;
  kind: "report" | "trace" | "video" | "har" | "console" | "screenshot";
  label: string;
  path: string;
  step?: string;
}

export type SessionStatus = "passed" | "failed" | "aborted";

export interface CaptureOptions {
  console: boolean;
  har: boolean;
  trace: boolean;
  video: boolean;
}

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
  status: SessionStatus;
  steps: ManifestStep[];
  summary: ManifestSummary;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Validate the critical fields at the IO boundary. Lenient by design: this is
// our own format, so we assert the structural anchors (kind/id/version + the
// containers the renderer reads) and trust the rest. Returns null on anything
// unparseable or off-shape so the scanner can skip it instead of crashing.
export function isSessionManifest(value: unknown): value is SessionManifest {
  if (!isObject(value)) {
    return false;
  }
  return (
    value.kind === "canary-session-result" &&
    typeof value.id === "string" &&
    typeof value.manifestVersion === "number" &&
    isObject(value.summary) &&
    Array.isArray(value.steps) &&
    isObject(value.artifacts)
  );
}

// Fill in the containers/fields consumers dereference, so a structurally valid
// but field-sparse manifest renders as empty rather than throwing.
function normalizeManifest(m: SessionManifest): SessionManifest {
  const artifacts = (m.artifacts ?? {}) as ManifestArtifacts;
  const summary = (m.summary ?? {}) as Partial<ManifestSummary>;
  return {
    ...m,
    artifacts: {
      ...artifacts,
      screenshots: artifacts.screenshots ?? {},
      videos: Array.isArray(artifacts.videos) ? artifacts.videos : [],
    },
    artifactList: Array.isArray(m.artifactList) ? m.artifactList : [],
    capture:
      m.capture ??
      ({ console: false, har: false, trace: false, video: false } as const),
    createdAt: typeof m.createdAt === "string" ? m.createdAt : "",
    endedAt: typeof m.endedAt === "string" ? m.endedAt : "",
    steps: (Array.isArray(m.steps) ? m.steps : []).map((step) => ({
      ...step,
      actions: Array.isArray(step?.actions) ? step.actions : [],
    })),
    summary: {
      commandCount: summary.commandCount ?? 0,
      consoleErrors: summary.consoleErrors ?? 0,
      networkFailures: summary.networkFailures ?? 0,
      stepsFailed: summary.stepsFailed ?? 0,
      stepsPassed: summary.stepsPassed ?? 0,
      stepsTotal: summary.stepsTotal ?? 0,
    },
  };
}

export function parseManifest(raw: string): SessionManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isSessionManifest(value) ? normalizeManifest(value) : null;
}
