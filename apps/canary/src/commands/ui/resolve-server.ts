import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// How `canary ui` should launch the @usecanary/ui web app:
//  - standalone: the built Astro node server `dist/server/entry.mjs` (fast path)
//  - dev: fall back to `astro dev` from the workspace when no build exists
export type ResolvedUiServer =
  | { kind: "standalone"; serverEntry: string }
  | { kind: "dev"; astroBin: string; workspaceDir: string };

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

// Walk up from this module's location looking for the apps/canary-ui workspace.
// Works whether the CLI runs bundled (apps/canary/dist/cli.js) or via tsx
// (apps/canary/src/cli.ts) — both sit under the monorepo root.
function findWorkspaceUiDir(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  let parent = path.dirname(dir);
  while (dir !== parent) {
    const ui = path.join(dir, "apps", "canary-ui");
    if (existsSync(path.join(ui, "package.json"))) {
      return ui;
    }
    dir = parent;
    parent = path.dirname(dir);
  }
  return null;
}

export async function resolveUiServer(): Promise<ResolvedUiServer | null> {
  // Explicit override (e.g. a shipped standalone build).
  const override = process.env.CANARY_UI_SERVER;
  if (override && (await isFile(override))) {
    return { kind: "standalone", serverEntry: override };
  }

  const workspaceDir = findWorkspaceUiDir();
  if (!workspaceDir) {
    return null;
  }

  const serverEntry = path.join(workspaceDir, "dist", "server", "entry.mjs");
  if (await isFile(serverEntry)) {
    return { kind: "standalone", serverEntry };
  }

  // astro's real JS entry (not the .bin shim, which is a shell script that
  // `node <path>` can't execute).
  const astroBin = path.join(
    workspaceDir,
    "node_modules",
    "astro",
    "bin",
    "astro.mjs"
  );
  if (await isFile(astroBin)) {
    return { kind: "dev", astroBin, workspaceDir };
  }

  return null;
}
