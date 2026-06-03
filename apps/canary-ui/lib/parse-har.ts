// Adapted verbatim from apps/canary/src/report/parse-har.ts. Total function:
// malformed / missing HAR yields an empty summary, never throws.

export interface HarRequestSummary {
  durationMs: number;
  method: string;
  status: number;
  url: string;
}

export interface HarSummary {
  entries: HarRequestSummary[];
  failed: number;
  slowest: HarRequestSummary[];
  total: number;
}

const EMPTY: HarSummary = { entries: [], failed: 0, slowest: [], total: 0 };

export function parseHar(raw: string): HarSummary {
  if (!raw.trim()) {
    return EMPTY;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }

  const log =
    parsed && typeof parsed === "object" && "log" in parsed
      ? (parsed as { log?: { entries?: unknown[] } }).log
      : undefined;
  const rawEntries = Array.isArray(log?.entries) ? log.entries : [];

  const entries: HarRequestSummary[] = rawEntries.map((value) => {
    const entry = value as {
      request?: { method?: string; url?: string };
      response?: { status?: number };
      time?: number;
    };
    return {
      // HAR uses time: -1 as the "not available" sentinel; treat any negative
      // (or non-numeric) value as 0 rather than reporting a negative duration.
      durationMs:
        typeof entry.time === "number" && entry.time >= 0
          ? Math.round(entry.time)
          : 0,
      method: entry.request?.method ?? "",
      status:
        typeof entry.response?.status === "number" ? entry.response.status : 0,
      url: entry.request?.url ?? "",
    };
  });

  const failed = entries.filter(
    (e) => e.status === 0 || e.status >= 400
  ).length;
  const slowest = [...entries]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);

  return { entries, failed, slowest, total: entries.length };
}
