// Readiness probe polled by `canary ui` before it opens the browser.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
