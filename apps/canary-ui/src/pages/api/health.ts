import type { APIRoute } from "astro";

// Readiness probe polled by `canary ui` before it opens the browser.
export const GET: APIRoute = () => Response.json({ ok: true });
