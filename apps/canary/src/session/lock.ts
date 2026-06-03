import { randomBytes } from "node:crypto";
import { open, readFile, rm, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { sessionDir } from "@canary/daemon-client";

const LOCK_FILE = "session.lock";
const RETRY_DELAY_MS = 50;
const MAX_WAIT_MS = 5000;
// A live holder refreshes the lock file's mtime every HEARTBEAT_MS while it
// runs. STALE_MS is several heartbeats, so a healthy holder is NEVER seen as
// stale no matter how long its critical section runs — a `canary run` can hold
// the lock across a long-running browser script (well past the daemon's default
// 30s script timeout). Only a crashed or wedged holder lets the mtime go stale
// and gets reclaimed. (Previously STALE_MS equalled the script timeout, so a
// legitimately long run had its still-held lock stolen by a concurrent process,
// breaking mutual exclusion and corrupting session.json.)
const HEARTBEAT_MS = 5000;
const STALE_MS = 20_000;

function lockPath(id: string): string {
  return path.join(sessionDir(id), LOCK_FILE);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH => gone; EPERM => exists but not ours.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface LockHolder {
  pid: number;
  token: string;
}

// Lock file payload is `${pid}:${token}`. The token uniquely identifies the
// acquisition so release can verify ownership and never delete a lock another
// process acquired after a stale-break.
function parseHolder(raw: string): LockHolder | null {
  const trimmed = raw.trim();
  const sep = trimmed.indexOf(":");
  if (sep === -1) {
    return null;
  }
  const pid = Number.parseInt(trimmed.slice(0, sep), 10);
  const token = trimmed.slice(sep + 1);
  if (!Number.isFinite(pid) || token === "") {
    return null;
  }
  return { pid, token };
}

// Break a lock whose holder process is dead, or whose mtime is older than
// STALE_MS (the holder crashed/wedged and stopped heartbeating, or crashed
// between create and write). Best-effort: a vanished lock is fine.
async function breakIfStale(file: string): Promise<void> {
  try {
    const info = await stat(file);
    const holder = parseHolder(await readFile(file, "utf8"));
    // An unparseable holder means the lock was created but not yet written (the
    // O_EXCL create/write window). Treat it as alive and fall back to the age
    // check, so we never steal a freshly-acquired lock and break mutual
    // exclusion; a genuinely abandoned lock is reclaimed after STALE_MS.
    const alive = holder ? pidAlive(holder.pid) : true;
    if (!alive || Date.now() - info.mtimeMs > STALE_MS) {
      await rm(file, { force: true });
    }
  } catch {
    // lock disappeared between checks — the next acquire attempt will win
  }
}

async function acquire(id: string): Promise<string> {
  const file = lockPath(id);
  const token = randomBytes(8).toString("hex");
  const deadline = Date.now() + MAX_WAIT_MS;
  while (true) {
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(`${process.pid}:${token}`);
      await handle.close();
      return token;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        throw err;
      }
      await breakIfStale(file);
      if (Date.now() > deadline) {
        throw new Error(`Timed out acquiring the session lock for "${id}"`);
      }
      await delay(RETRY_DELAY_MS);
    }
  }
}

// Release only if we still own the lock (token matches). After a stale-break,
// another process can acquire its own lock under the same path; deleting by
// path alone would remove *their* live lock and break mutual exclusion.
async function release(id: string, token: string): Promise<void> {
  try {
    const holder = parseHolder(await readFile(lockPath(id), "utf8"));
    if (holder?.token === token) {
      await rm(lockPath(id), { force: true });
    }
  } catch {
    // lock already gone — nothing to release
  }
}

// Cross-process advisory lock around a session.json read-modify-write. Needed
// because concurrent `canary run --session X` invocations are separate
// processes that each append a step.
export async function withSessionLock<T>(
  id: string,
  fn: () => Promise<T>
): Promise<T> {
  const token = await acquire(id);
  const file = lockPath(id);
  // Keep the lock's mtime fresh so a long critical section is never mistaken
  // for a stale/abandoned lock. unref() so the heartbeat can't keep the process
  // alive on its own.
  const heartbeat = setInterval(() => {
    const now = new Date();
    utimes(file, now, now).catch(() => undefined);
  }, HEARTBEAT_MS);
  heartbeat.unref();
  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await release(id, token);
  }
}
