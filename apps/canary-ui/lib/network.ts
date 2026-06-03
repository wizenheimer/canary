// Rich HAR parsing for the DevTools-style Network tab. This is a UI-only
// companion to parse-har.ts (which stays in lock-step with the report copy via
// parser-drift.test.ts and must not gain fields). Total function: malformed or
// missing HAR yields an empty list, never throws.

export interface NetworkHeader {
  name: string;
  value: string;
}

export type NetworkResourceType =
  | "document"
  | "stylesheet"
  | "script"
  | "image"
  | "media"
  | "font"
  | "fetch"
  | "xhr"
  | "websocket"
  | "other";

export interface NetworkRequest {
  durationMs: number;
  index: number;
  method: string;
  mimeType: string;
  queryString: NetworkHeader[];
  remoteAddress: string;
  requestBody: string;
  requestBodyMime: string;
  requestHeaders: NetworkHeader[];
  resourceType: NetworkResourceType;
  responseBody: string;
  responseBodyTruncated: boolean;
  responseHeaders: NetworkHeader[];
  responseSize: number;
  startedDateTime: string;
  status: number;
  statusText: string;
  url: string;
}

const BODY_CAP = 256 * 1024;
const TEXT_MIME =
  /(json|javascript|xml|html|css|text\/|svg|x-www-form|graphql)/i;

interface RawHeader {
  name?: string;
  value?: string;
}

function headers(value: unknown): NetworkHeader[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((h) => {
      const { name, value: v } = (h ?? {}) as RawHeader;
      return { name: name ?? "", value: v ?? "" };
    })
    .filter((h) => h.name.length > 0);
}

function isTextMime(mime: string): boolean {
  return TEXT_MIME.test(mime);
}

function inferType(rt: string, mime: string): NetworkResourceType {
  switch (rt) {
    case "document":
    case "stylesheet":
    case "script":
    case "image":
    case "media":
    case "font":
    case "xhr":
    case "fetch":
    case "websocket":
      return rt;
    case "eventsource":
      return "fetch";
    default:
      break;
  }
  if (/^text\/html/.test(mime)) {
    return "document";
  }
  if (/^text\/css/.test(mime)) {
    return "stylesheet";
  }
  if (/javascript|ecmascript/.test(mime)) {
    return "script";
  }
  if (/^image\//.test(mime)) {
    return "image";
  }
  if (/^(audio|video)\//.test(mime)) {
    return "media";
  }
  if (/font/.test(mime)) {
    return "font";
  }
  if (/json/.test(mime)) {
    return "fetch";
  }
  return "other";
}

interface RawEntry {
  _resourceType?: string;
  request?: {
    bodySize?: number;
    headers?: unknown;
    method?: string;
    postData?: { mimeType?: string; text?: string };
    queryString?: unknown;
    url?: string;
  };
  response?: {
    _transferSize?: number;
    bodySize?: number;
    content?: {
      encoding?: string;
      mimeType?: string;
      size?: number;
      text?: string;
    };
    headers?: unknown;
    status?: number;
    statusText?: string;
  };
  serverIPAddress?: string;
  startedDateTime?: string;
  time?: number;
}

// First non-negative number wins; avoids a nested ternary over the size fields.
function firstSize(...vals: (number | undefined)[]): number {
  for (const v of vals) {
    if (typeof v === "number" && v >= 0) {
      return v;
    }
  }
  return 0;
}

// A response body is only surfaced for text-like, non-base64 content (so images
// and other binaries don't bloat the payload), capped at BODY_CAP.
function textBody(
  content: NonNullable<RawEntry["response"]>["content"],
  mimeType: string
): { body: string; truncated: boolean } {
  const raw = typeof content?.text === "string" ? content.text : "";
  if (!raw || content?.encoding === "base64" || !isTextMime(mimeType)) {
    return { body: "", truncated: false };
  }
  return { body: raw.slice(0, BODY_CAP), truncated: raw.length > BODY_CAP };
}

function clampDuration(time: number | undefined): number {
  return typeof time === "number" && time >= 0 ? Math.round(time) : 0;
}

function toRequest(value: unknown, index: number): NetworkRequest {
  const entry = (value ?? {}) as RawEntry;
  const req = entry.request ?? {};
  const res = entry.response ?? {};
  const content = res.content ?? {};
  const mimeType = (content.mimeType ?? "").split(";")[0]?.trim() ?? "";
  const { body, truncated } = textBody(content, mimeType);
  const reqText =
    typeof req.postData?.text === "string" ? req.postData.text : "";

  return {
    durationMs: clampDuration(entry.time),
    index,
    method: req.method ?? "",
    mimeType,
    queryString: headers(req.queryString),
    remoteAddress: entry.serverIPAddress ?? "",
    requestBody: reqText.slice(0, BODY_CAP),
    requestBodyMime: req.postData?.mimeType ?? "",
    requestHeaders: headers(req.headers),
    resourceType: inferType(entry._resourceType ?? "", mimeType),
    responseBody: body,
    responseBodyTruncated: truncated,
    responseHeaders: headers(res.headers),
    responseSize: firstSize(content.size, res.bodySize, res._transferSize),
    startedDateTime: entry.startedDateTime ?? "",
    status: typeof res.status === "number" ? res.status : 0,
    statusText: res.statusText ?? "",
    url: req.url ?? "",
  };
}

export function parseNetwork(raw: string): NetworkRequest[] {
  if (!raw.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const log =
    parsed && typeof parsed === "object" && "log" in parsed
      ? (parsed as { log?: { entries?: unknown[] } }).log
      : undefined;
  const rawEntries = Array.isArray(log?.entries) ? log.entries : [];
  return rawEntries.map((e, i) => toRequest(e, i));
}

// Shell-safe single-quoting: close the quote, emit an escaped quote, reopen.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// Build a runnable `curl` command from a captured request. HTTP/2 pseudo-headers
// (":authority" etc.) are dropped since curl rejects them.
export function toCurl(req: NetworkRequest): string {
  const parts = [`curl ${shellQuote(req.url)}`];
  if (req.method && req.method.toUpperCase() !== "GET") {
    parts.push(`-X ${req.method.toUpperCase()}`);
  }
  for (const h of req.requestHeaders) {
    if (h.name.startsWith(":") || h.name.toLowerCase() === "content-length") {
      continue;
    }
    parts.push(`-H ${shellQuote(`${h.name}: ${h.value}`)}`);
  }
  if (req.requestBody) {
    parts.push(`--data-raw ${shellQuote(req.requestBody)}`);
  }
  return parts.join(" \\\n  ");
}
