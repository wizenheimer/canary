import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "./fs-json";
import { defaultSessionsRoot, uiConfigPath } from "./paths";

// Thrown when a client tries to register a path that isn't an existing
// directory; the route maps it to a 400.
export class InvalidRootError extends Error {}

// In-process serialization for the single shared ui.json. Like overlay.ts's
// per-root chain, this turns concurrent read-modify-write mutations (and the
// seed-write a read can trigger) into a queue, so the last writer can't clobber
// a just-added root. One Next server process → one chain suffices.
let configChain: Promise<unknown> = Promise.resolve();
function serializeConfig<T>(op: () => Promise<T>): Promise<T> {
  const run = configChain.then(op, op);
  configChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// A registered source folder. The client only ever references roots by their
// opaque `id` — raw paths never cross the wire, so a request can't ask the
// server to read an arbitrary location. The id maps back to a path server-side.
export interface Root {
  id: string;
  isDefault?: boolean;
  label: string;
  path: string;
}

interface UiConfig {
  lastRootId?: string;
  roots: Root[];
  version: number;
}

const CONFIG_VERSION = 1;

export function rootIdFor(absPath: string): string {
  return createHash("sha256")
    .update(path.resolve(absPath))
    .digest("hex")
    .slice(0, 12);
}

function makeRoot(absPath: string, label?: string, isDefault?: boolean): Root {
  const resolved = path.resolve(absPath);
  const root: Root = {
    id: rootIdFor(resolved),
    label: label ?? path.basename(resolved) ?? resolved,
    path: resolved,
  };
  if (isDefault) {
    root.isDefault = true;
  }
  return root;
}

async function readConfig(): Promise<UiConfig> {
  const cfg = await readJsonFile<UiConfig>(uiConfigPath(), {
    roots: [],
    version: CONFIG_VERSION,
  });
  if (!Array.isArray(cfg.roots)) {
    cfg.roots = [];
  }
  return cfg;
}

// Guarantee the default ~/.canary/sessions root is always registered.
function seedDefault(cfg: UiConfig): void {
  const def = makeRoot(defaultSessionsRoot(), "Default sessions", true);
  const existing = cfg.roots.find((r) => r.id === def.id);
  if (existing) {
    existing.isDefault = true;
  } else {
    cfg.roots.unshift(def);
  }
}

// Load the registry, seeding the default root and (if `canary ui --dir` set
// CANARY_UI_ROOT) the launch root, which becomes the selected one. Persists
// only when seeding changed something.
export function loadRoots(): Promise<{
  lastRootId: string;
  roots: Root[];
}> {
  return serializeConfig(async () => {
    const cfg = await readConfig();
    const before = JSON.stringify(cfg);
    seedDefault(cfg);

    let initialId = cfg.lastRootId;
    const envRoot = process.env.CANARY_UI_ROOT?.trim();
    if (envRoot) {
      const r = makeRoot(envRoot);
      if (!cfg.roots.some((x) => x.id === r.id)) {
        cfg.roots.push(r);
      }
      initialId = r.id;
    }
    if (!(initialId && cfg.roots.some((r) => r.id === initialId))) {
      initialId = cfg.roots[0]?.id ?? rootIdFor(defaultSessionsRoot());
    }
    cfg.lastRootId = initialId;

    if (JSON.stringify(cfg) !== before) {
      await writeJsonFileAtomic(uiConfigPath(), cfg);
    }
    return { lastRootId: initialId, roots: cfg.roots };
  });
}

export async function getRootById(id: string): Promise<Root | null> {
  const { roots } = await loadRoots();
  return roots.find((r) => r.id === id) ?? null;
}

export async function addRoot(absPath: string, label?: string): Promise<Root> {
  // Defense-in-depth: a registered root becomes a readable base for the artifact
  // route, so only accept a path that is actually an existing directory. This
  // rejects pointing a "root" at a file (e.g. /etc/passwd) or a typo'd path.
  const resolved = path.resolve(absPath);
  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      throw new InvalidRootError(`Not a directory: ${resolved}`);
    }
  } catch (err) {
    if (err instanceof InvalidRootError) {
      throw err;
    }
    throw new InvalidRootError(`No such directory: ${resolved}`);
  }
  return serializeConfig(async () => {
    const cfg = await readConfig();
    seedDefault(cfg);
    const root = makeRoot(resolved, label);
    if (!cfg.roots.some((r) => r.id === root.id)) {
      cfg.roots.push(root);
    }
    cfg.lastRootId = root.id;
    await writeJsonFileAtomic(uiConfigPath(), cfg);
    return root;
  });
}

// Remove a non-default root. The default is re-seeded on every load, so it
// cannot be removed.
export function removeRoot(id: string): Promise<unknown> {
  return serializeConfig(async () => {
    const cfg = await readConfig();
    seedDefault(cfg);
    cfg.roots = cfg.roots.filter((r) => !(r.id === id && !r.isDefault));
    if (cfg.lastRootId === id) {
      cfg.lastRootId = cfg.roots[0]?.id;
    }
    await writeJsonFileAtomic(uiConfigPath(), cfg);
  });
}

export function setLastRoot(id: string): Promise<unknown> {
  return serializeConfig(async () => {
    const cfg = await readConfig();
    seedDefault(cfg);
    if (cfg.roots.some((r) => r.id === id)) {
      cfg.lastRootId = id;
      await writeJsonFileAtomic(uiConfigPath(), cfg);
    }
  });
}
