// Pure, client-safe formatters mirroring the report's helpers
// (apps/canary/src/report/render-report.ts).

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    const secs = ms / 1000;
    // Avoid "60.0s": a value in [59950, 60000) rounds to 60.0 at one decimal,
    // so roll it into the minutes form instead.
    if (Number(secs.toFixed(1)) < 60) {
      return `${secs.toFixed(1)}s`;
    }
  }
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  return new Date(ms).toLocaleString();
}

// Compact "time ago" for cards. Rendered client-side only (after fetch), so no
// SSR/hydration timezone mismatch.
export function fmtRelative(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  const diff = Date.now() - ms;
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  if (diff < 7 * 86_400_000) {
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }
  return new Date(ms).toLocaleDateString();
}

// Build a path-safe artifact URL for the secure /api/artifact route.
export function artifactUrl(
  rootId: string,
  sessionId: string,
  relPath: string
): string {
  const params = new URLSearchParams({
    id: sessionId,
    path: relPath,
    root: rootId,
  });
  return `/api/artifact?${params.toString()}`;
}
