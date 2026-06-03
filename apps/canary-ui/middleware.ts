import { type NextRequest, NextResponse } from "next/server";

// Same-origin guard for state-changing requests. The UI server binds to
// localhost and has no auth, so without this a page on attacker.com could drive
// its mutating endpoints (register an arbitrary root → read any file, or empty
// the trash) via a cross-origin POST. Reads stay open (their cross-origin
// responses are opaque anyway); only mutating methods are gated.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function sameOrigin(request: NextRequest): boolean {
  // Modern browsers attach Sec-Fetch-Site; trust it when present.
  const site = request.headers.get("sec-fetch-site");
  if (site) {
    // "none" = user-initiated (typed URL / bookmark); "same-origin"/"same-site"
    // are first-party. Only "cross-site" is rejected.
    return site === "same-origin" || site === "same-site" || site === "none";
  }
  // Fallback: compare the Origin header's host to the request Host.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === request.headers.get("host");
    } catch {
      return false;
    }
  }
  // No browser provenance headers at all → a non-browser client (curl, the
  // user's own tooling). CSRF needs an ambient-credential browser, so allow.
  return true;
}

export function middleware(request: NextRequest) {
  if (MUTATING.has(request.method) && !sameOrigin(request)) {
    return NextResponse.json(
      { error: "cross-origin request blocked" },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
