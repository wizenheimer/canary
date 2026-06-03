import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

// Resolve `npm` (or `npm.cmd` on Windows) from PATH. We resolve manually
// rather than passing `shell: true` to spawn so we avoid argv quoting
// bugs on Windows.
export function npmCommand(): string {
  if (process.platform === "win32") {
    return findInPath("npm.cmd") ?? findInPath("npm") ?? "npm.cmd";
  }
  return findInPath("npm") ?? "npm";
}

function findInPath(name: string): string | null {
  const pathEnv = process.env.PATH ?? "";
  for (const entry of pathEnv.split(delimiter)) {
    if (!entry) {
      continue;
    }
    const candidate = join(entry, name);
    try {
      accessSync(candidate, constants.F_OK | constants.X_OK);
      return candidate;
    } catch {
      // try next entry
    }
  }
  return null;
}
