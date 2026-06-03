import { unzipSync } from "fflate";

// A single Playwright call extracted from the session trace — the readable
// answer to "what command was sent". apiName is reconstructed as `Class.method`
// (the trace omits the public apiName); params is a short, noise-filtered summary.
export interface TraceAction {
  apiName: string;
  durationMs?: number;
  error?: string;
  params?: string;
}

export interface TraceActions {
  // Actions grouped by the enclosing step name (our per-step tracing.group).
  byStep: Record<string, TraceAction[]>;
  total: number;
}

// Keys present on nearly every call that add no signal to a one-line summary.
const NOISE_KEYS = new Set(["timeout", "waitUntil", "isFunction", "arg"]);
const MAX_PARAMS = 140;

function truncate(value: string): string {
  return value.length > MAX_PARAMS
    ? `${value.slice(0, MAX_PARAMS - 1)}…`
    : value;
}

function summarizeParams(params: unknown): string | undefined {
  if (!params || typeof params !== "object") {
    return;
  }
  const record = params as Record<string, unknown>;
  if (typeof record.url === "string") {
    return truncate(record.url);
  }
  if (typeof record.expression === "string") {
    return truncate(record.expression);
  }
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!NOISE_KEYS.has(key)) {
      rest[key] = value;
    }
  }
  if (Object.keys(rest).length === 0) {
    return;
  }
  return truncate(JSON.stringify(rest));
}

interface BeforeEvent {
  callId?: string;
  class?: string;
  method?: string;
  params?: unknown;
  startTime?: number;
  title?: string;
}

interface AfterInfo {
  endTime?: number;
  error?: string;
}

// Unzip + decode only the small `trace.trace` entry. "" on any failure.
function readTraceText(zip: Uint8Array): string {
  try {
    const files = unzipSync(zip, { filter: (f) => f.name === "trace.trace" });
    const bytes = files["trace.trace"];
    return bytes ? new TextDecoder().decode(bytes) : "";
  } catch {
    return "";
  }
}

// Split the JSONL trace into before-events (in start order) and an after-map.
function parseEvents(text: string): {
  afters: Map<string, AfterInfo>;
  befores: BeforeEvent[];
} {
  const befores: BeforeEvent[] = [];
  const afters = new Map<string, AfterInfo>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === "before") {
      befores.push(event as BeforeEvent);
    } else if (event.type === "after" && typeof event.callId === "string") {
      const err = event.error as { message?: string } | undefined;
      afters.set(event.callId, {
        endTime: typeof event.endTime === "number" ? event.endTime : undefined,
        error: typeof err?.message === "string" ? err.message : undefined,
      });
    }
  }
  // Events are appended in start order, but sort defensively before segmenting.
  befores.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  return { afters, befores };
}

// Fuse a before-event with its paired after-info into one readable action.
function toAction(
  before: BeforeEvent,
  after: AfterInfo | undefined
): TraceAction {
  const action: TraceAction = {
    // Join only the present parts so a one-sided event (class or method missing)
    // yields "Frame" / "goto" rather than a dangling "Frame." / ".goto".
    apiName: [before.class, before.method].filter(Boolean).join("."),
  };
  const params = summarizeParams(before.params);
  if (params !== undefined) {
    action.params = params;
  }
  if (after?.endTime !== undefined && before.startTime !== undefined) {
    action.durationMs = Math.max(
      0,
      Math.round(after.endTime - before.startTime)
    );
  }
  if (after?.error) {
    action.error = after.error;
  }
  return action;
}

// Total function: parse the per-step Playwright action log out of a trace.zip.
// Reuses the already-captured trace (only the `trace.trace` entry is inflated).
// Any malformed / missing / unexpected input yields an empty result, never throws.
export function parseTraceActions(zip: Uint8Array): TraceActions {
  const { befores, afters } = parseEvents(readTraceText(zip));
  const byStep: Record<string, TraceAction[]> = {};
  let currentStep = "(setup)";
  let total = 0;
  for (const before of befores) {
    // Our per-step boundary: tracing.group(stepName) → step name in `title`.
    if (before.class === "Tracing" && before.method === "tracingGroup") {
      if (typeof before.title === "string" && before.title) {
        currentStep = before.title;
      }
      continue;
    }
    if (!(before.class || before.method)) {
      continue;
    }
    const after = before.callId ? afters.get(before.callId) : undefined;
    const bucket = byStep[currentStep] ?? [];
    byStep[currentStep] = bucket;
    bucket.push(toAction(before, after));
    total += 1;
  }
  return { byStep, total };
}
