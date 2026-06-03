import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { isDaemonRunning } from "../ipc/connect.js";
import { logger } from "../logger.js";
import { daemonPidPath } from "../paths.js";
import { findDaemonCommand } from "./entry.js";
import { embeddedRuntimeInstalled } from "./extract.js";
import { spawnDaemon } from "./spawn.js";

const log = logger.child({ component: "daemon-supervisor" });

const STARTUP_DEADLINE_MS = 5000;
const POLL_INTERVAL_MS = 100;

// Returns the daemon PID from ~/.canary/daemon.pid, or null if the
// file is missing/unreadable/unparseable.
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
export async function ensureDaemonRunning(): Promise<void> {
  if (await isDaemonRunning()) {
    log.debug("daemon already running");
    return;
  }

  const command = await findDaemonCommand();
  if (
    command.requiresRuntimeInstall &&
    !(await embeddedRuntimeInstalled(command.workdir))
  ) {
    throw new Error(
      "Embedded daemon dependencies are missing. Run `canary install` first."
    );
  }

  log.debug(
    { program: command.program, workdir: command.workdir },
    "spawning daemon"
  );
  spawnDaemon(command);

  const deadline = Date.now() + STARTUP_DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (await isDaemonRunning()) {
      log.debug("daemon started");
      return;
    }
  }
  throw new Error("Daemon failed to start within 5 seconds");
}

// Waits up to `timeoutMs` for the daemon to stop accepting connections.
export async function waitForDaemonExit(
  _pid: number | null,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isDaemonRunning())) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const seconds = Math.round(timeoutMs / 1000);
  throw new Error(`Daemon failed to stop within ${seconds} seconds`);
}
