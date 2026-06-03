import { requestId } from "@canary/cli-kit";
import { ensureDaemonRunning, sendRequest } from "@canary/daemon-client";
import { reconcileStaleActiveSessions } from "../session/reconcile.js";
import { readSessionRecord } from "../session/registry.js";
import { renderSessionRecord, renderStatusResult } from "./render.js";

interface StatusArgs {
  json: boolean;
  sessionId?: string;
}

export async function statusCommand(args: StatusArgs): Promise<number> {
  if (args.sessionId) {
    // Reconcile a zombie "active" record (daemon restarted) so status reflects
    // the daemon's live view rather than a stale on-disk "active".
    await reconcileStaleActiveSessions();
    let record: Awaited<ReturnType<typeof readSessionRecord>>;
    try {
      record = await readSessionRecord(args.sessionId);
    } catch (err) {
      process.stderr.write(`${(err as Error).message}\n`);
      return 1;
    }
    if (args.json) {
      process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
    } else {
      renderSessionRecord(record, process.stdout);
    }
    return 0;
  }

  // No --session: report the daemon's own status.
  await ensureDaemonRunning();
  return sendRequest(
    { id: requestId("status"), type: "status" },
    renderStatusResult
  );
}
