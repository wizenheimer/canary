import type { APIRoute } from "astro";
import { jsonError, resolveRoot } from "@/lib/api";
import { loadOverlay } from "@/lib/overlay";
import { listSessions, listTrash } from "@/lib/sessions";

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const root = await resolveRoot(searchParams.get("root"));
  if (!root) {
    return jsonError("unknown root", 403);
  }

  if (searchParams.get("view") === "trash") {
    const sessions = await listTrash(root.path);
    return Response.json({ root, sessions });
  }

  const [sessions, overlay, trash] = await Promise.all([
    listSessions(root.path),
    loadOverlay(root.path),
    listTrash(root.path),
  ]);
  return Response.json({
    folders: overlay.folders,
    root,
    sessions,
    trashCount: trash.length,
  });
};
