import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  sessionDir,
  sessionRecordPath,
  sessionsRootDir,
} from "@usecanary/daemon-client";
import type { CaptureOptions } from "@usecanary/protocol";
import { withSessionLock } from "./lock.js";

export const SESSION_SCHEMA_VERSION = 1;

export interface SessionStep {
  durationMs: number;
  exitCode: number;
  name: string;
  ok: boolean;
  // The script text this step ran — surfaced in the report/results.json so a
  // reviewer can see what the agent actually sent.
  script?: string;
  startedAt: string;
}

export interface SessionRecord {
  artifactsDir: string;
  browser: string;
  capture: CaptureOptions;
  createdAt: string;
  endedAt?: string;
  headless: boolean;
  id: string;
  name?: string;
  schemaVersion: number;
  status: "active" | "ended" | "aborted";
  steps: SessionStep[];
}

async function atomicWriteJson(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

export async function createSessionRecord(
  record: SessionRecord
): Promise<void> {
  await mkdir(sessionDir(record.id), { recursive: true });
  await atomicWriteJson(sessionRecordPath(record.id), record);
}

export async function readSessionRecord(id: string): Promise<SessionRecord> {
  try {
    const raw = await readFile(sessionRecordPath(id), "utf8");
    return JSON.parse(raw) as SessionRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No such session "${id}"`);
    }
    throw err;
  }
}

// Atomic, lock-free write. Callers doing a read-modify-write must hold the
// session lock first (see updateSessionRecord, or withSessionLock in run.ts).
export async function writeSessionRecord(record: SessionRecord): Promise<void> {
  await atomicWriteJson(sessionRecordPath(record.id), record);
}

// Read-modify-write under the per-session lock. The mutator edits the record in
// place; the updated record is persisted atomically and returned.
export function updateSessionRecord(
  id: string,
  mutate: (record: SessionRecord) => void
): Promise<SessionRecord> {
  return withSessionLock(id, async () => {
    const record = await readSessionRecord(id);
    mutate(record);
    await writeSessionRecord(record);
    return record;
  });
}

export async function listSessions(): Promise<SessionRecord[]> {
  let entries: string[];
  try {
    entries = await readdir(sessionsRootDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const settled = await Promise.all(
    entries.map((entryId) => readSessionRecord(entryId).catch(() => null))
  );
  return settled
    .filter((record): record is SessionRecord => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
