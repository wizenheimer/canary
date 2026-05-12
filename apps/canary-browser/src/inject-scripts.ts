import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";

export const INJECT_SCRIPT_ENV_VAR = "DEV_BROWSER_INJECT_SCRIPT";

// Splits the env-var value on commas and newlines, trims, and drops empties.
// Mirrors the agent-browser convention (comma OR newline separated).
export function parseInjectScriptEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Merges env entries (first) with flag entries (in argv order). No de-duping
// here — the daemon hashes script content and dedupes server-side, so passing
// the same path twice is harmless.
export function collectInjectScriptPaths(
  envValue: string | undefined,
  flagValues: readonly string[]
): string[] {
  return [...parseInjectScriptEnv(envValue), ...flagValues];
}

export type ReadFileFn = (path: string, encoding: "utf8") => Promise<string>;

// Resolves each path against cwd and reads the file. On failure, throws with
// the offending path so the user knows which entry is broken.
export async function readInjectScripts(
  paths: readonly string[],
  cwd: string,
  readFile: ReadFileFn = (filePath, encoding) => fsReadFile(filePath, encoding)
): Promise<string[]> {
  const contents: string[] = [];
  for (const entry of paths) {
    const resolved = path.isAbsolute(entry) ? entry : path.resolve(cwd, entry);
    try {
      const text = await readFile(resolved, "utf8");
      contents.push(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`--inject-script: failed to read ${entry}: ${reason}`);
    }
  }
  return contents;
}
