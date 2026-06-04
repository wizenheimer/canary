import os from "node:os";
import path from "node:path";

// Re-derived locally (instead of importing @usecanary/daemon-client) so the web app
// stays decoupled from the CLI/daemon package graph. Mirrors the canonical
// layout in packages/daemon-client/src/paths.ts: ~/.canary/sessions.

export function canaryDir(): string {
  // CANARY_DIR lets the UI's config base be redirected (used by tests for
  // isolation, and as an escape hatch for non-default installs). Default is the
  // canonical ~/.canary so the UI sees what the CLI/daemon write.
  const override = process.env.CANARY_DIR;
  return override ? path.resolve(override) : path.join(os.homedir(), ".canary");
}

export function defaultSessionsRoot(): string {
  return path.join(canaryDir(), "sessions");
}

// Global UI config (registered source roots + prefs). Distinct from the
// per-root organization overlay (<root>/.canary-ui.json).
export function uiConfigPath(): string {
  return path.join(canaryDir(), "ui.json");
}

// Trash + overlay live inside each root so they travel with the folder.
export const TRASH_DIRNAME = ".trash";
export const OVERLAY_FILENAME = ".canary-ui.json";
