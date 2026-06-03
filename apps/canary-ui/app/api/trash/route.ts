import { asString, jsonError, readJsonBody, resolveRoot } from "@/lib/api";
import { purgeSession, withOverlay } from "@/lib/overlay";
import {
  deleteTrashed,
  emptyTrash,
  restoreSession,
  trashSession,
} from "@/lib/trash";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError("bad request", 400);
  }
  const root = await resolveRoot(asString(body.root));
  if (!root) {
    return jsonError("unknown root", 403);
  }
  const action = asString(body.action);
  const id = asString(body.id);

  if (action === "trash") {
    if (!id) {
      return jsonError("id required", 400);
    }
    return Response.json({ ok: await trashSession(root.path, id) });
  }

  if (action === "restore") {
    if (!id) {
      return jsonError("id required", 400);
    }
    return Response.json({ ok: await restoreSession(root.path, id) });
  }

  if (action === "delete") {
    if (!id) {
      return jsonError("id required", 400);
    }
    const ok = await deleteTrashed(root.path, id);
    // Only purge overlay metadata when we actually deleted a trashed session —
    // otherwise a stale/duplicate delete would wipe the tags/notes/folder of a
    // session that was already restored and is live again.
    if (ok) {
      await withOverlay(root.path, (overlay) => purgeSession(overlay, id));
    }
    return Response.json({ ok });
  }

  if (action === "empty") {
    const ids = await emptyTrash(root.path);
    await withOverlay(root.path, (overlay) => {
      for (const sessionId of ids) {
        purgeSession(overlay, sessionId);
      }
    });
    return Response.json({ ok: true, removed: ids.length });
  }

  return jsonError("unknown action", 400);
}
