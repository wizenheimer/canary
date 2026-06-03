import { asString, jsonError, readJsonBody, resolveRoot } from "@/lib/api";
import {
  createFolder,
  deleteFolder,
  moveSession,
  type Overlay,
  renameFolder,
  setNote,
  setTags,
  withOverlay,
} from "@/lib/overlay";

export const dynamic = "force-dynamic";

const KNOWN_OPS = new Set([
  "createFolder",
  "renameFolder",
  "deleteFolder",
  "move",
  "tags",
  "note",
]);

function applyOp(
  overlay: Overlay,
  op: string,
  body: Record<string, unknown>
): boolean {
  switch (op) {
    case "createFolder":
      return createFolder(overlay, asString(body.path) ?? "");
    case "renameFolder":
      return renameFolder(
        overlay,
        asString(body.from) ?? "",
        asString(body.to) ?? ""
      );
    case "deleteFolder":
      return deleteFolder(overlay, asString(body.path) ?? "");
    case "move":
      return moveSession(
        overlay,
        asString(body.id) ?? "",
        body.folder === null ? null : (asString(body.folder) ?? "")
      );
    case "tags": {
      const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
      setTags(overlay, asString(body.id) ?? "", tags);
      return true;
    }
    case "note":
      setNote(overlay, asString(body.id) ?? "", asString(body.note) ?? "");
      return true;
    default:
      return false;
  }
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError("bad request", 400);
  }
  const root = await resolveRoot(asString(body.root));
  if (!root) {
    return jsonError("unknown root", 403);
  }
  const op = asString(body.op);
  if (!(op && KNOWN_OPS.has(op))) {
    return jsonError("unknown op", 400);
  }
  const ok = await withOverlay(root.path, (overlay) =>
    applyOp(overlay, op, body)
  );
  return Response.json({ ok });
}
