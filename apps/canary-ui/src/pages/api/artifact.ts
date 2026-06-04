import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { APIRoute } from "astro";
import { jsonError, resolveRoot } from "@/lib/api";
import {
  contentTypeFor,
  isHtmlContentType,
  parseByteRange,
  safeResolveArtifact,
} from "@/lib/artifacts";
import { sessionDirFor } from "@/lib/sessions";

// Stream a sibling artifact (screenshot/video/trace/har/console) out of a
// session dir. Security: root resolves via the registered-roots allowlist, the
// session id must be a safe segment, and safeResolveArtifact rejects any
// traversal or symlink escape. Range is supported so videos can seek.
export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const root = await resolveRoot(searchParams.get("root"));
  if (!root) {
    return jsonError("unknown root", 403);
  }
  const id = searchParams.get("id");
  const rel = searchParams.get("path");
  if (!(id && rel)) {
    return jsonError("id and path required", 400);
  }
  const dir = sessionDirFor(root.path, id);
  if (!dir) {
    return jsonError("bad id", 400);
  }
  const abs = await safeResolveArtifact(dir, rel);
  if (!abs) {
    return jsonError("not found", 404);
  }

  // The file can vanish between safeResolveArtifact's check and here (e.g. a
  // concurrent trash/empty). Treat that as a clean 404 rather than a 500.
  let size: number;
  try {
    size = (await stat(abs)).size;
  } catch {
    return jsonError("not found", 404);
  }
  const contentType = contentTypeFor(abs);
  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  };
  // A served HTML artifact (the report) renders in the app's origin; sandbox it
  // with a CSP so a tampered report can't exfiltrate or call back into the API.
  if (isHtmlContentType(contentType)) {
    baseHeaders["Content-Security-Policy"] =
      "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:";
  }

  const range = parseByteRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response("range not satisfiable", {
      headers: { "Content-Range": `bytes */${size}` },
      status: 416,
    });
  }

  if (range) {
    const stream = createReadStream(abs, {
      end: range.end,
      start: range.start,
    });
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
      status: 206,
    });
  }

  const stream = createReadStream(abs);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: { ...baseHeaders, "Content-Length": String(size) },
    status: 200,
  });
};
