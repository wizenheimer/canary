import { realpath, stat } from "node:fs/promises";
import path from "node:path";

// ── Path-safety: the artifact route serves arbitrary sibling files out of a
// session dir, so traversal/symlink-escape must be impossible. These helpers
// are pure (except safeResolveArtifact) so they can be unit-tested directly.

// A session id (or folder segment) used in a filesystem path must be a single
// safe component — no separators, no traversal, no NUL.
export function isSafeSegment(seg: string): boolean {
  return (
    seg.length > 0 &&
    !seg.includes("/") &&
    !seg.includes("\\") &&
    !seg.includes("\0") &&
    seg !== "." &&
    seg !== ".."
  );
}

// True iff `target` is `base` itself or lies within it. Uses path.relative so
// it is correct on both POSIX and Windows and avoids the "/foo" vs "/foobar"
// prefix bug.
export function isPathInside(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  return rel === "" || !(rel.startsWith("..") || path.isAbsolute(rel));
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".har": "application/json",
  ".json": "application/json",
  ".log": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  // The self-contained session report — served as HTML so the "Original report"
  // link opens in-app instead of downloading as an octet-stream.
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
};

// True for content types the browser will execute scripts from; the artifact
// route tightens CSP for these (a session dir is local data, but a served HTML
// file shouldn't be able to exfiltrate or reach back into the app's origin).
export function isHtmlContentType(contentType: string): boolean {
  return contentType.startsWith("text/html");
}

export function contentTypeFor(filePath: string): string {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

export interface ByteRange {
  end: number;
  start: number;
}

// Parse a single HTTP byte range against a known size.
// - null   → no Range header (serve whole file, 200)
// - "invalid" → unsatisfiable/garbled (respond 416)
// - {start,end} → satisfiable inclusive range (respond 206)
export function parseByteRange(
  header: string | null,
  size: number
): ByteRange | null | "invalid" {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return "invalid";
  }
  const startStr = match[1] ?? "";
  const endStr = match[2] ?? "";
  let start: number;
  let end: number;
  if (startStr === "") {
    // suffix range: last N bytes
    if (endStr === "") {
      return "invalid";
    }
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return "invalid";
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? size - 1 : Number(endStr);
  }
  if (!(Number.isFinite(start) && Number.isFinite(end))) {
    return "invalid";
  }
  if (start > end || start < 0 || start >= size || end >= size) {
    return "invalid";
  }
  return { end, start };
}

// Resolve `relPath` to an absolute file inside `sessionDir`, or null if it
// would escape (lexically or via symlink) or isn't a regular file.
export async function safeResolveArtifact(
  sessionDir: string,
  relPath: string
): Promise<string | null> {
  if (!relPath || path.isAbsolute(relPath)) {
    return null;
  }
  const requested = path.resolve(sessionDir, relPath);
  if (!isPathInside(sessionDir, requested)) {
    return null;
  }
  let realBase: string;
  let realTarget: string;
  try {
    realBase = await realpath(sessionDir);
    realTarget = await realpath(requested);
  } catch {
    return null;
  }
  if (!isPathInside(realBase, realTarget)) {
    return null;
  }
  try {
    const info = await stat(realTarget);
    if (!info.isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  return realTarget;
}
