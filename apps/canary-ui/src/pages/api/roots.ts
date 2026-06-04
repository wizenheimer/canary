import type { APIRoute } from "astro";
import { asString, jsonError, readJsonBody } from "@/lib/api";
import {
  addRoot,
  InvalidRootError,
  loadRoots,
  removeRoot,
  setLastRoot,
} from "@/lib/roots";

export const GET: APIRoute = async () => {
  const { roots, lastRootId } = await loadRoots();
  return Response.json({ lastRootId, roots });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJsonBody(request);
  if (!body) {
    return jsonError("bad request", 400);
  }
  const action = asString(body.action);

  if (action === "add") {
    const dir = asString(body.path);
    if (!dir) {
      return jsonError("path required", 400);
    }
    const label = asString(body.label) ?? undefined;
    try {
      const root = await addRoot(dir, label);
      return Response.json({ root });
    } catch (err) {
      if (err instanceof InvalidRootError) {
        return jsonError(err.message, 400);
      }
      throw err;
    }
  }

  if (action === "remove") {
    const id = asString(body.id);
    if (!id) {
      return jsonError("id required", 400);
    }
    await removeRoot(id);
    return Response.json({ ok: true });
  }

  if (action === "select") {
    const id = asString(body.id);
    if (!id) {
      return jsonError("id required", 400);
    }
    await setLastRoot(id);
    return Response.json({ ok: true });
  }

  return jsonError("unknown action", 400);
};
