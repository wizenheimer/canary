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

export const RequestSchema = z.discriminatedUnion("type", [
  ExecuteRequestSchema,
  BrowsersRequestSchema,
  BrowserStopRequestSchema,
  StatusRequestSchema,
  InstallRequestSchema,
  StopRequestSchema,
]);

export type Request = z.infer<typeof RequestSchema>;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;
export type BrowsersRequest = z.infer<typeof BrowsersRequestSchema>;
export type BrowserStopRequest = z.infer<typeof BrowserStopRequestSchema>;
export type StatusRequest = z.infer<typeof StatusRequestSchema>;
export type InstallRequest = z.infer<typeof InstallRequestSchema>;
export type StopRequest = z.infer<typeof StopRequestSchema>;

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
