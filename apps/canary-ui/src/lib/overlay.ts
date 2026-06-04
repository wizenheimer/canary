import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "./fs-json";
import { OVERLAY_FILENAME } from "./paths";

// The organization overlay for a root, stored at <root>/.canary-ui.json. Virtual
// folders: sessions stay flat on disk; this sidecar records the folder tree and
// per-session assignment/tags/notes. It travels with the folder and references
// sessions by id — entries for missing sessions are simply ignored (self-heals).
export interface Overlay {
  assignments: Record<string, string>;
  folders: string[];
  notes: Record<string, string>;
  tags: Record<string, string[]>;
  version: number;
}

const OVERLAY_VERSION = 1;

function emptyOverlay(): Overlay {
  return {
    assignments: {},
    folders: [],
    notes: {},
    tags: {},
    version: OVERLAY_VERSION,
  };
}

function overlayPath(rootPath: string): string {
  return path.join(rootPath, OVERLAY_FILENAME);
}

export async function loadOverlay(rootPath: string): Promise<Overlay> {
  const raw = await readJsonFile<Partial<Overlay>>(
    overlayPath(rootPath),
    emptyOverlay()
  );
  return {
    assignments: raw.assignments ?? {},
    folders: Array.isArray(raw.folders) ? raw.folders : [],
    notes: raw.notes ?? {},
    tags: raw.tags ?? {},
    version: typeof raw.version === "number" ? raw.version : OVERLAY_VERSION,
  };
}

// Per-root, in-process write serialization so concurrent API mutations can't
// clobber each other (single Next server process → an in-memory chain suffices).
const chains = new Map<string, Promise<unknown>>();

export function withOverlay<T>(
  rootPath: string,
  mutator: (overlay: Overlay) => T | Promise<T>
): Promise<T> {
  const prev = chains.get(rootPath) ?? Promise.resolve();
  const run = prev.then(
    () => mutate(rootPath, mutator),
    () => mutate(rootPath, mutator)
  );
  chains.set(
    rootPath,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

async function mutate<T>(
  rootPath: string,
  mutator: (overlay: Overlay) => T | Promise<T>
): Promise<T> {
  const overlay = await loadOverlay(rootPath);
  const result = await mutator(overlay);
  await writeJsonFileAtomic(overlayPath(rootPath), overlay);
  return result;
}

// ── Pure folder-path helpers + mutators (operate in place on an Overlay) ──

// Normalize a user folder path: trim, collapse repeated slashes, drop leading/
// trailing slashes, reject empty / "." / ".." segments. Returns null if invalid.
export function normalizeFolderPath(input: string): string | null {
  const segments = input
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) {
    return null;
  }
  if (segments.some((s) => s === "." || s === "..")) {
    return null;
  }
  return segments.join("/");
}

// Every ancestor prefix of a folder path, inclusive: "a/b/c" → [a, a/b, a/b/c].
function ancestorsOf(folderPath: string): string[] {
  const segments = folderPath.split("/");
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    out.push(segments.slice(0, i + 1).join("/"));
  }
  return out;
}

function sortUnique(list: string[]): string[] {
  return Array.from(new Set(list)).sort((a, b) => a.localeCompare(b));
}

export function createFolder(overlay: Overlay, folderPath: string): boolean {
  const norm = normalizeFolderPath(folderPath);
  if (!norm) {
    return false;
  }
  overlay.folders = sortUnique([...overlay.folders, ...ancestorsOf(norm)]);
  return true;
}

export function renameFolder(
  overlay: Overlay,
  fromPath: string,
  toPath: string
): boolean {
  const from = normalizeFolderPath(fromPath);
  const to = normalizeFolderPath(toPath);
  if (!(from && to)) {
    return false;
  }
  const rewrite = (p: string): string => {
    if (p === from) {
      return to;
    }
    if (p.startsWith(`${from}/`)) {
      return `${to}${p.slice(from.length)}`;
    }
    return p;
  };
  overlay.folders = sortUnique([
    ...overlay.folders.map(rewrite),
    ...ancestorsOf(to),
  ]);
  for (const [id, folder] of Object.entries(overlay.assignments)) {
    overlay.assignments[id] = rewrite(folder);
  }
  return true;
}

export function deleteFolder(overlay: Overlay, folderPath: string): boolean {
  const target = normalizeFolderPath(folderPath);
  if (!target) {
    return false;
  }
  const within = (p: string): boolean =>
    p === target || p.startsWith(`${target}/`);
  overlay.folders = overlay.folders.filter((p) => !within(p));
  for (const [id, folder] of Object.entries(overlay.assignments)) {
    if (within(folder)) {
      delete overlay.assignments[id];
    }
  }
  return true;
}

// Assign a session to a folder (creating it + ancestors), or unfile it (null).
export function moveSession(
  overlay: Overlay,
  sessionId: string,
  folderPath: string | null
): boolean {
  if (folderPath === null) {
    delete overlay.assignments[sessionId];
    return true;
  }
  const norm = normalizeFolderPath(folderPath);
  if (!norm) {
    return false;
  }
  overlay.folders = sortUnique([...overlay.folders, ...ancestorsOf(norm)]);
  overlay.assignments[sessionId] = norm;
  return true;
}

export function setTags(
  overlay: Overlay,
  sessionId: string,
  tags: string[]
): void {
  const clean = sortUnique(
    tags.map((t) => t.trim()).filter((t) => t.length > 0)
  );
  if (clean.length === 0) {
    delete overlay.tags[sessionId];
  } else {
    overlay.tags[sessionId] = clean;
  }
}

export function setNote(
  overlay: Overlay,
  sessionId: string,
  note: string
): void {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    delete overlay.notes[sessionId];
  } else {
    overlay.notes[sessionId] = trimmed;
  }
}

// Drop all overlay entries for a session (used on permanent delete).
export function purgeSession(overlay: Overlay, sessionId: string): void {
  delete overlay.assignments[sessionId];
  delete overlay.tags[sessionId];
  delete overlay.notes[sessionId];
}
