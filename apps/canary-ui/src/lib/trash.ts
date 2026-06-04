import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { isSafeSegment } from "./artifacts";
import { TRASH_DIRNAME } from "./paths";

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

// Delete-to-trash: sessions move to <root>/.trash/<id> (a rename within the same
// root, so cheap + restorable). The scanner skips dotfiles, so trashed sessions
// drop out of the normal listing. Overlay entries are kept for restore and only
// purged on permanent delete (caller's responsibility, via overlay.purgeSession).

function trashRoot(rootPath: string): string {
  return path.join(rootPath, TRASH_DIRNAME);
}

export async function trashSession(
  rootPath: string,
  id: string
): Promise<boolean> {
  if (!isSafeSegment(id)) {
    return false;
  }
  await mkdir(trashRoot(rootPath), { recursive: true });
  try {
    await rename(path.join(rootPath, id), path.join(trashRoot(rootPath), id));
    return true;
  } catch {
    return false;
  }
}

export async function restoreSession(
  rootPath: string,
  id: string
): Promise<boolean> {
  if (!isSafeSegment(id)) {
    return false;
  }
  // Never overwrite a live session that already occupies the id (POSIX rename
  // replaces an empty destination dir, which would silently clobber it).
  if (await exists(path.join(rootPath, id))) {
    return false;
  }
  try {
    await rename(path.join(trashRoot(rootPath), id), path.join(rootPath, id));
    return true;
  } catch {
    return false;
  }
}

// Permanently remove a trashed session. Returns true only if a trashed dir for
// `id` actually existed and was removed — callers use this to decide whether to
// purge overlay metadata, so a no-op delete must NOT report success (else it
// would wipe a still-live session's tags/notes after a restore).
export async function deleteTrashed(
  rootPath: string,
  id: string
): Promise<boolean> {
  if (!isSafeSegment(id)) {
    return false;
  }
  const target = path.join(trashRoot(rootPath), id);
  if (!(await exists(target))) {
    return false;
  }
  try {
    await rm(target, { force: true, recursive: true });
    return true;
  } catch {
    return false;
  }
}

// Permanently empty the trash. Returns the ids removed so the caller can purge
// their overlay entries.
export async function emptyTrash(rootPath: string): Promise<string[]> {
  let ids: string[] = [];
  try {
    const entries = await readdir(trashRoot(rootPath), { withFileTypes: true });
    ids = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
  await rm(trashRoot(rootPath), { force: true, recursive: true });
  return ids;
}
