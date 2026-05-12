import { randomBytes } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";

// Write `contents` to `path` via a sibling temp file plus rename.
// Mirrors cli/src/skill.rs:192-216 and cli-go/internal/skill/atomic.go —
// pattern is `.{name}.tmp-{pid}-{nonce}` so both binaries interoperate
// during the parity window.
export async function atomicWrite(path: string, contents: string | Uint8Array): Promise<void> {
  const tempPath = tempPathFor(path);
  try {
    await writeFile(tempPath, contents);
  } catch (err) {
    throw new Error(`Failed to write ${tempPath}: ${describe(err)}`);
  }

  try {
    await rename(tempPath, path);
  } catch (err) {
    try {
      await unlink(tempPath);
    } catch {
      // ignore cleanup failure
    }
    throw new Error(`Failed to replace ${path}: ${describe(err)}`);
  }
}

function tempPathFor(path: string): string {
  const dir = dirname(path);
  const base = basename(path);
  if (base === "." || base === sep || base === "") {
    throw new Error(`Could not determine a file name for ${path}`);
  }
  const nonce = randomBytes(8).toString("hex");
  return join(dir, `.${base}.tmp-${process.pid}-${nonce}`);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
