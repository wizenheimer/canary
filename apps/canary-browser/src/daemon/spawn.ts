import { spawn } from "node:child_process";
import { logger } from "../logger.js";

export interface DaemonCommand {
  args: string[];
  program: string;
  requiresRuntimeInstall: boolean;
  workdir: string;
}

// Spawn the daemon as a fully detached background process.
//
// - `detached: true` on POSIX calls setsid(2) on the child, matching Rust's
//   `libc::setsid` in cli/src/daemon.rs:121-126.
// - `detached: true` on Windows sets DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
//   matching cli-go/internal/daemon/spawn_windows.go.
// - `stdio: "ignore"` replaces stdin/stdout/stderr with /dev/null equivalents.
// - `windowsHide: true` prevents a flash console window on GUI parents (Rust
//   doesn't set this, but it's strictly an improvement; cli-go does the same).
// - `child.unref()` lets the CLI exit without waiting for the daemon.
export function spawnDaemon(command: DaemonCommand): void {
  const child = spawn(command.program, command.args, {
    cwd: command.workdir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", (err) => {
    // Errors are otherwise surfaced via the socket-poll loop in lifecycle.ts —
    // if the spawn fails the daemon never comes up and ensureRunning() returns
    // "Daemon failed to start within 5 seconds". Log the underlying cause.
    logger.error({ err }, "daemon process spawn error");
  });
  child.unref();
}
