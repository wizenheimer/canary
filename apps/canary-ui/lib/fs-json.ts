import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Read + parse a JSON file, returning `fallback` if it is missing or
// unparseable. Never throws on the common "not there yet" path.
export async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Atomic write: write to a temp sibling then rename over the target, so a
// concurrent reader never sees a half-written file. Mirrors the orchestrator's
// atomicWriteJson in apps/canary/src/session/registry.ts.
export async function writeJsonFileAtomic(
  file: string,
  data: unknown
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Math.trunc(performance.now())}`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}
