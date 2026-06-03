import { requestId } from "@canary/cli-kit";
import {
  currentDaemonPid,
  isDaemonRunning,
  sendRequest,
  waitForDaemonExit,
} from "@canary/daemon-client";
import type { StatusSummary } from "@canary/protocol";
import { logger } from "../logger.js";
import { listSessions } from "../session/registry.js";

const EXIT_WAIT_MS = 10_000;

// Send the graceful "stop" RPC and wait for the daemon to exit. Returns the RPC
// exit code. Callers handle the "already stopped" path first.
async function sendStop(): Promise<number> {
  const pid = await currentDaemonPid();
  const code = await sendRequest(
    { id: requestId("stop"), type: "stop" },
    undefined
  );
  if (code === 0 && pid !== null) {
    // The daemon accepted the stop. Wait for it to actually exit, but a slow
    // exit is NOT a failure of the stop command — waitForDaemonExit throws on
    // timeout, so swallow that and report the graceful stop as successful.
    await waitForDaemonExit(pid, EXIT_WAIT_MS).catch((err) => {
      logger.debug({ err }, "daemon slow to exit after accepting stop");
    });
  }
  return code;
}

// `canary daemon stop` — first-class, graceful daemon shutdown that mirrors
// `canary-browser stop`. Reuses the daemon's existing "stop" RPC.
export async function daemonStop(json: boolean): Promise<number> {
  if (!(await isDaemonRunning())) {
    process.stdout.write(
      json
        ? `${JSON.stringify({ running: false, stopped: false })}\n`
        : "Daemon is not running.\n"
    );
    return 0;
  }
  const code = await sendStop();
  if (code === 0) {
    process.stdout.write(
      json ? `${JSON.stringify({ stopped: true })}\n` : "Daemon stopped.\n"
    );
  }
  return code;
}

// Opt-in `--stop-daemon` for `session end` / `session abort`: stop the daemon
// only when no OTHER work remains (other active sessions or non-session
// browsers); otherwise leave it running and say why. Best-effort — never throws.
export async function stopDaemonIfIdle(
  currentSessionId: string,
  json: boolean
): Promise<void> {
  if (!(await isDaemonRunning())) {
    return; // already down (e.g. session end finalized from disk)
  }

  let others = 0;
  try {
    others = (await listSessions()).filter(
      (s) => s.status === "active" && s.id !== currentSessionId
    ).length;
  } catch {
    // can't enumerate sessions — be conservative and leave the daemon up
    return;
  }

  let browsers = 0;
  try {
    await sendRequest({ id: requestId("status"), type: "status" }, (data) => {
      browsers = (data as StatusSummary).browserCount;
    });
  } catch {
    // can't read daemon status — be conservative and leave the daemon up
    return;
  }

  if (others > 0 || browsers > 0) {
    if (!json) {
      process.stdout.write(
        `Daemon left running — ${others} other session(s), ${browsers} browser(s) active. Run \`canary daemon stop\` to stop it.\n`
      );
    }
    return;
  }

  try {
    const code = await sendStop();
    if (code === 0 && !json) {
      process.stdout.write("Daemon stopped.\n");
    }
  } catch (err) {
    // Best-effort, as documented: the session already ended successfully, so a
    // failure to stop the (now-idle) daemon must not fail the command.
    logger.debug({ err, sessionId: currentSessionId }, "stop-daemon failed");
  }
}
