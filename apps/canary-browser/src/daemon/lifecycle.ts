import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { daemonPidPath, devBrowserDir } from "../paths.js";
import { isDaemonRunning } from "../ipc/connect.js";
import { embeddedRuntimeInstalled } from "./extract.js";
import { findDaemonCommand } from "./entry.js";
import { spawnDaemon } from "./spawn.js";

const STARTUP_DEADLINE_MS = 5_000;
const POLL_INTERVAL_MS = 100;

// Returns the daemon PID from ~/.dev-browser/daemon.pid, or null if the
// file is missing/unreadable/unparseable. Matches cli/src/daemon.rs daemon_pid.
export async function currentDaemonPid(): Promise<number | null> {
  try {
    const raw = await readFile(daemonPidPath(), "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// Throws if the daemon cannot be brought up within STARTUP_DEADLINE_MS.
// Mirrors cli/src/daemon.rs ensure_daemon.
export async function ensureDaemonRunning(): Promise<void> {
  if (await isDaemonRunning()) return;

  const command = await findDaemonCommand();
  if (command.requiresRuntimeInstall && !(await embeddedRuntimeInstalled(command.workdir))) {
    throw new Error("Embedded daemon dependencies are missing. Run `dev-browser install` first.");
  }

  spawnDaemon(command);

  const deadline = Date.now() + STARTUP_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (await isDaemonRunning()) return;
  }
  throw new Error("Daemon failed to start within 5 seconds");
}

// Waits up to `timeoutMs` for the daemon to stop accepting connections.
// Mirrors cli/src/daemon.rs wait_for_daemon_exit.
export async function waitForDaemonExit(_pid: number | null, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isDaemonRunning())) return;
    await sleep(POLL_INTERVAL_MS);
  }
  const seconds = Math.round(timeoutMs / 1000);
  throw new Error(`Daemon failed to stop within ${seconds} seconds`);
}

// Re-export for downstream callers (status command).
export { devBrowserDir };
