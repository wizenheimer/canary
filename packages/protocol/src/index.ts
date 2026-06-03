// Canary daemon IPC protocol — single source of truth.
//
// All requests and responses on the daemon's named-pipe / Unix socket are
// validated against these Zod schemas. CLIs (`canary`, `canary-browser`)
// import the inferred TypeScript types only; the daemon imports the schemas
// for runtime validation.
//
// Previously this lived in two places (daemon Zod + CLI plain types) with a
// CI drift-check. The extraction here eliminates that class of bug entirely.

import { z } from "zod";

// ---------- Requests ----------

const RequestBaseSchema = z.object({
  id: z.string().min(1),
});

export const ExecuteRequestSchema = RequestBaseSchema.extend({
  type: z.literal("execute"),
  browser: z.string().min(1).default("default"),
  script: z.string(),
  headless: z.boolean().optional(),
  ignoreHTTPSErrors: z.boolean().optional(),
  connect: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
  initScripts: z.array(z.string()).optional(),
  // Optional step label. When the target browser is a session context, the
  // daemon wraps the run in tracing.group(step)/groupEnd and screenshots the
  // active page to the session's screenshots/<step>.png after a successful run.
  step: z.string().min(1).max(200).optional(),
});

export const BrowsersRequestSchema = RequestBaseSchema.extend({
  type: z.literal("browsers"),
});

export const BrowserStopRequestSchema = RequestBaseSchema.extend({
  type: z.literal("browser-stop"),
  browser: z.string().min(1),
});

export const StatusRequestSchema = RequestBaseSchema.extend({
  type: z.literal("status"),
});

export const InstallRequestSchema = RequestBaseSchema.extend({
  type: z.literal("install"),
});

export const StopRequestSchema = RequestBaseSchema.extend({
  type: z.literal("stop"),
});

// ---------- Session capture ----------

// Which auditability artifacts a session records. All default on; the
// orchestrator turns individual ones off via `--no-<kind>` flags.
export const CaptureOptionsSchema = z.object({
  trace: z.boolean().default(true),
  video: z.boolean().default(true),
  har: z.boolean().default(true),
  console: z.boolean().default(true),
});

// Session ids double as on-disk directory names and the reserved browser key
// `__session__<id>`. Reject path traversal and anything outside a safe set.
const SessionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^(?!.*\.\.)[A-Za-z0-9._-]+$/, "invalid session id");

export const SessionStartRequestSchema = RequestBaseSchema.extend({
  type: z.literal("session-start"),
  sessionId: SessionIdSchema,
  name: z.string().min(1).max(200).optional(),
  headless: z.boolean().optional(),
  ignoreHTTPSErrors: z.boolean().optional(),
  capture: CaptureOptionsSchema.default({}),
});

export const SessionEndRequestSchema = RequestBaseSchema.extend({
  type: z.literal("session-end"),
  sessionId: SessionIdSchema,
  reason: z.enum(["end", "abort"]).default("end"),
});

export const SessionStatusRequestSchema = RequestBaseSchema.extend({
  type: z.literal("session-status"),
  sessionId: SessionIdSchema,
});

export const SessionListRequestSchema = RequestBaseSchema.extend({
  type: z.literal("session-list"),
});

export const RequestSchema = z.discriminatedUnion("type", [
  ExecuteRequestSchema,
  BrowsersRequestSchema,
  BrowserStopRequestSchema,
  StatusRequestSchema,
  InstallRequestSchema,
  StopRequestSchema,
  SessionStartRequestSchema,
  SessionEndRequestSchema,
  SessionStatusRequestSchema,
  SessionListRequestSchema,
]);

export type Request = z.infer<typeof RequestSchema>;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;
export type BrowsersRequest = z.infer<typeof BrowsersRequestSchema>;
export type BrowserStopRequest = z.infer<typeof BrowserStopRequestSchema>;
export type StatusRequest = z.infer<typeof StatusRequestSchema>;
export type InstallRequest = z.infer<typeof InstallRequestSchema>;
export type StopRequest = z.infer<typeof StopRequestSchema>;
export type SessionStartRequest = z.infer<typeof SessionStartRequestSchema>;
export type SessionEndRequest = z.infer<typeof SessionEndRequestSchema>;
export type SessionStatusRequest = z.infer<typeof SessionStatusRequestSchema>;
export type SessionListRequest = z.infer<typeof SessionListRequestSchema>;
export type CaptureOptions = z.infer<typeof CaptureOptionsSchema>;

// ---------- Responses ----------

const ResponseBaseSchema = z.object({
  id: z.string().min(1),
});

export const StdoutMessageSchema = ResponseBaseSchema.extend({
  type: z.literal("stdout"),
  data: z.string(),
});

export const StderrMessageSchema = ResponseBaseSchema.extend({
  type: z.literal("stderr"),
  data: z.string(),
});

export const CompleteMessageSchema = ResponseBaseSchema.extend({
  type: z.literal("complete"),
  success: z.literal(true),
});

export const ErrorMessageSchema = ResponseBaseSchema.extend({
  type: z.literal("error"),
  message: z.string(),
});

export const ResultMessageSchema = ResponseBaseSchema.extend({
  type: z.literal("result"),
  data: z.unknown(),
});

export const ResponseSchema = z.discriminatedUnion("type", [
  StdoutMessageSchema,
  StderrMessageSchema,
  CompleteMessageSchema,
  ErrorMessageSchema,
  ResultMessageSchema,
]);

export type Response = z.infer<typeof ResponseSchema>;
export type StdoutMessage = z.infer<typeof StdoutMessageSchema>;
export type StderrMessage = z.infer<typeof StderrMessageSchema>;
export type CompleteMessage = z.infer<typeof CompleteMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type ResultMessage = z.infer<typeof ResultMessageSchema>;

// ---------- Result payload shapes ----------
// These are the `data` carried by certain ResultMessage responses. They're
// not validated on the wire (the daemon shapes them, the CLI consumes), but
// they're typed here so both sides agree.

export interface BrowserSummary {
  name: string;
  pages: string[];
  status: "running" | "connected" | "disconnected";
  type: "launched" | "connected";
}

export interface StatusSummary {
  browserCount: number;
  browsers: BrowserSummary[];
  pid: number;
  socketPath: string;
  uptimeMs: number;
}

// ---------- Session result payloads ----------
// Shaped by the daemon, consumed by the `canary` orchestrator. Like the other
// result payloads, these are not validated on the wire.

export type SessionPhase = "active" | "ending" | "ended" | "aborted" | "failed";

export interface ArtifactInfo {
  bytes: number;
  kind: "trace" | "video" | "har" | "console" | "screenshot";
  pageName?: string;
  path: string;
}

export interface SessionSummary {
  artifactsDir: string;
  browser: string;
  capture: CaptureOptions;
  endedAt?: number;
  headless: boolean;
  name?: string;
  pageCount: number;
  phase: SessionPhase;
  runCount: number;
  sessionId: string;
  startedAt: number;
}

export interface SessionStartResult {
  session: SessionSummary;
}

export interface SessionEndResult {
  artifacts: ArtifactInfo[];
  manifestPath: string;
  session: SessionSummary;
}

export interface SessionStatusResult {
  session: SessionSummary;
}

export interface SessionListResult {
  sessions: SessionSummary[];
}

// Deterministic, content-derived hash so two distinct step names can't map to
// the same slug. Pure JS (djb2) — no node:crypto — so @usecanary/protocol stays
// dependency-light. 32-bit, base36; collision across a session's handful of
// steps is astronomically unlikely.
function slugHash(value: string): string {
  // djb2 in modular arithmetic (no bitwise ops). Each step stays under 2^53, so
  // it's exact; the result is a stable non-negative base36 string.
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33 + value.charCodeAt(i)) % 2_147_483_647;
  }
  return hash.toString(36);
}

// Filesystem-safe screenshot filename stem for a session step. Shared by the
// daemon (which writes screenshots/<slug>.png) and the orchestrator's report
// (which maps steps → screenshots) so the two never drift. A short hash of the
// ORIGINAL name is appended so distinct names that sanitize to the same stem
// (e.g. "login/admin" vs "login-admin", or names differing only past char 200)
// don't collide on one screenshot file and get misattributed in the report.
export function sessionStepSlug(step: string): string {
  const base =
    step
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 200) || "step";
  return `${base}-${slugHash(step)}`;
}

// ---------- Session artifact layout ----------
// Filenames/dirs the daemon writes under a session's artifacts dir. Shared with
// the orchestrator's on-disk report fallback (endResultFromDisk) so the two
// always enumerate the same set — renaming an artifact here updates both.
export const SESSION_TRACE_FILE = "trace.zip";
export const SESSION_HAR_FILE = "network.har";
export const SESSION_CONSOLE_FILE = "console.log";
export const SESSION_VIDEO_DIR = "video";
export const SESSION_VIDEO_EXT = ".webm";
export const SESSION_SCREENSHOTS_DIR = "screenshots";
export const SESSION_SCREENSHOT_EXT = ".png";

// ---------- Daemon runtime ----------
// Single source of truth for the npm-managed runtime the daemon needs in
// ~/.canary (installed by `canary install`). Both the daemon's socket `install`
// handler (apps/canary-daemon) and the daemon-client extract path write the
// identical EMBEDDED_PACKAGE_JSON, and the readiness check derives its allowlist
// from DAEMON_RUNTIME_DEPENDENCIES — so adding a dependency can't drift them.

export const DAEMON_RUNTIME_DEPENDENCIES: Record<string, string> = {
  pino: "^9.5.0",
  playwright: "1.58.2",
  "playwright-core": "1.58.2",
  "quickjs-emscripten": "^0.32.0",
};

export const EMBEDDED_PACKAGE_JSON: string = JSON.stringify(
  {
    name: "canary-runtime",
    private: true,
    type: "module",
    dependencies: DAEMON_RUNTIME_DEPENDENCIES,
  },
  null,
  2
);

// ---------- Helpers ----------

interface ParseSuccess {
  request: Request;
  success: true;
}
interface ParseFailure {
  error: string;
  id?: string;
  success: false;
}

function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "request";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function extractId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const maybeId = (value as { id?: unknown }).id;
  return typeof maybeId === "string" && maybeId.length > 0
    ? maybeId
    : undefined;
}

export function parseRequest(line: string): ParseSuccess | ParseFailure {
  let parsed: unknown;

  try {
    parsed = JSON.parse(line);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid JSON request",
    };
  }

  const result = RequestSchema.safeParse(parsed);
  if (!result.success) {
    const id = extractId(parsed);
    return {
      success: false,
      error: describeZodError(result.error),
      ...(id === undefined ? {} : { id }),
    };
  }

  return {
    success: true,
    request: result.data,
  };
}

export function serialize(message: Response): string {
  return `${JSON.stringify(ResponseSchema.parse(message))}\n`;
}
