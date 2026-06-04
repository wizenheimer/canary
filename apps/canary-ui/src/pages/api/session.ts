import type { APIRoute } from "astro";
import { jsonError, resolveRoot } from "@/lib/api";
import { loadOverlay } from "@/lib/overlay";
import { getSessionDetail } from "@/lib/sessions";

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const root = await resolveRoot(searchParams.get("root"));
  if (!root) {
    return jsonError("unknown root", 403);
  }
  const id = searchParams.get("id");
  if (!id) {
    return jsonError("id required", 400);
  }

  const detail = await getSessionDetail(root.path, id);
  if (!detail) {
    return jsonError("session not found", 404);
  }
  const overlay = await loadOverlay(root.path);
  return Response.json({
    console: detail.console,
    folder: overlay.assignments[id] ?? null,
    har: detail.har,
    manifest: detail.manifest,
    network: detail.network,
    note: overlay.notes[id] ?? "",
    rootId: root.id,
    tags: overlay.tags[id] ?? [],
  });
};
