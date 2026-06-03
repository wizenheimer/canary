import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// How `canary ui` should launch the @usecanary/ui web app:
//  - standalone: a built Next standalone `server.js` (fast path)
//  - dev: fall back to `next dev` from the workspace when no build exists
export type ResolvedUiServer =
  | { kind: "standalone"; serverJs: string }
  | { kind: "dev"; nextBin: string; workspaceDir: string };

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
    return { kind: "standalone", serverJs: override };
  }

  const workspaceDir = findWorkspaceUiDir();
  if (!workspaceDir) {
    return null;
  }

  const serverJs = path.join(
    workspaceDir,
    ".next",
    "standalone",
    "apps",
    "canary-ui",
    "server.js"
  );
  if (await isFile(serverJs)) {
    return { kind: "standalone", serverJs };
  }

  const nextBin = path.join(workspaceDir, "node_modules", ".bin", "next");
  if (await isFile(nextBin)) {
    return { kind: "dev", nextBin, workspaceDir };
  }

  return null;
}
