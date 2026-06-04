import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isSafeSegment, safeResolveArtifact } from "./artifacts";
import {
  parseManifest,
  type SessionManifest,
  type SessionStatus,
} from "./manifest";
import { type NetworkRequest, parseNetwork } from "./network";
import { loadOverlay, type Overlay } from "./overlay";
import { type ConsoleEntry, parseConsole } from "./parse-console";
import { type HarSummary, parseHar } from "./parse-har";
import { TRASH_DIRNAME } from "./paths";

const RESULTS_FILE = "results.json";
const CONSOLE_FILE = "console.log";
const HAR_FILE = "network.har";

// A root is a flat container of `<id>/results.json` session dirs. Sessions stay
// flat on disk — folders are virtual (see overlay.ts) — so a session's dir is
// always <root>/<id>. Point `--dir` at a folder that contains session dirs.
export function sessionDirFor(rootPath: string, id: string): string | null {
  if (!isSafeSegment(id)) {
    return null;
  }
  return path.join(rootPath, id);
}

export interface SessionCard {
  consoleErrors: number;
  createdAt: string;
  durationMs: number;
  endedAt: string;
  folder: string | null;
  hasTrace: boolean;
  hasVideo: boolean;
  id: string;
  name: string;
  networkFailures: number;
  note?: string;
  status: SessionStatus;
  stepsFailed: number;
  stepsPassed: number;
  stepsTotal: number;
  tags: string[];
  thumbnail: string | null;
}

async function scanDir(
  dir: string
): Promise<{ id: string; manifest: SessionManifest }[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: { id: string; manifest: SessionManifest }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    let raw: string;
    try {
      raw = await readFile(path.join(dir, entry.name, RESULTS_FILE), "utf8");
    } catch {
      continue;
    }
    const manifest = parseManifest(raw);
    if (manifest) {
      out.push({ id: entry.name, manifest });
    }
  }
  return out;
}

// A representative still for the card-view preview: the final step's screenshot
// (the end state), falling back to any captured screenshot. Returns the path
// relative to the session dir, served via /api/artifact; null when none exist.
function pickThumbnail(m: SessionManifest): string | null {
  for (let i = m.steps.length - 1; i >= 0; i -= 1) {
    const shot = m.steps[i]?.screenshot;
    if (shot) {
      return shot;
    }
  }
  return Object.values(m.artifacts.screenshots)[0]?.path ?? null;
}

function toCard(id: string, m: SessionManifest, overlay: Overlay): SessionCard {
  const card: SessionCard = {
    consoleErrors: m.summary.consoleErrors,
    createdAt: m.createdAt,
    durationMs: m.durationMs,
    endedAt: m.endedAt,
    folder: overlay.assignments[id] ?? null,
    hasTrace: Boolean(m.artifacts.trace),
    hasVideo: m.artifacts.videos.length > 0,
    id,
    name: m.name ?? id,
    networkFailures: m.summary.networkFailures,
    status: m.status,
    stepsFailed: m.summary.stepsFailed,
    stepsPassed: m.summary.stepsPassed,
    stepsTotal: m.summary.stepsTotal,
    tags: overlay.tags[id] ?? [],
    thumbnail: pickThumbnail(m),
  };
  const note = overlay.notes[id];
  if (note) {
    card.note = note;
  }
  return card;
}

function byNewest(a: SessionCard, b: SessionCard): number {
  // Coalesce defensively: a manifest with no createdAt normalizes to "" rather
  // than undefined, but never call localeCompare on a possibly-absent value.
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

export async function listSessions(rootPath: string): Promise<SessionCard[]> {
  const [found, overlay] = await Promise.all([
    scanDir(rootPath),
    loadOverlay(rootPath),
  ]);
  return found
    .map(({ id, manifest }) => toCard(id, manifest, overlay))
    .sort(byNewest);
}

export async function listTrash(rootPath: string): Promise<SessionCard[]> {
  const trashDir = path.join(rootPath, TRASH_DIRNAME);
  const [found, overlay] = await Promise.all([
    scanDir(trashDir),
    loadOverlay(rootPath),
  ]);
  return found
    .map(({ id, manifest }) => toCard(id, manifest, overlay))
    .sort(byNewest);
}

export interface SessionDetail {
  console: ConsoleEntry[];
  har: HarSummary;
  manifest: SessionManifest;
  network: NetworkRequest[];
}

async function readArtifactText(
  dir: string,
  relPath: string | undefined,
  fallbackName: string
): Promise<string> {
  const abs = await safeResolveArtifact(dir, relPath ?? fallbackName);
  if (!abs) {
    return "";
  }
  try {
    return await readFile(abs, "utf8");
  } catch {
    return "";
  }
}

// Full detail for the tabbed view: the manifest plus the parsed Console/Network
// sibling files (their full detail isn't inlined in results.json).
export async function getSessionDetail(
  rootPath: string,
  id: string
): Promise<SessionDetail | null> {
  const dir = sessionDirFor(rootPath, id);
  if (!dir) {
    return null;
  }
  let raw: string;
  try {
    raw = await readFile(path.join(dir, RESULTS_FILE), "utf8");
  } catch {
    return null;
  }
  const manifest = parseManifest(raw);
  if (!manifest) {
    return null;
  }
  const [consoleText, harText] = await Promise.all([
    readArtifactText(dir, manifest.artifacts.console?.path, CONSOLE_FILE),
    readArtifactText(dir, manifest.artifacts.har?.path, HAR_FILE),
  ]);
  return {
    console: parseConsole(consoleText),
    har: parseHar(harText),
    manifest,
    network: parseNetwork(harText),
  };
}
