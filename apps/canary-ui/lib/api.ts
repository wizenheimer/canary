import { getRootById, type Root } from "./roots";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

// Resolve a client-supplied root id to a registered root, or null. The
// allowlist (only registered roots are resolvable) is the file-read security
// boundary: raw paths never cross the wire, so a request can't point the server
// at an arbitrary location on disk.
export async function resolveRoot(rootId: string | null): Promise<Root | null> {
  if (!rootId) {
    return null;
  }
  return await getRootById(rootId);
}

export async function readJsonBody(
  request: Request
): Promise<Record<string, unknown> | null> {
  // Require an explicit JSON content-type. text/plain (and the empty default)
  // are CORS "simple" types that skip the preflight, so rejecting them removes
  // a no-preflight cross-origin write path (defense-in-depth with middleware).
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    const value = await request.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
