import { requestId } from "@usecanary/cli-kit";
import { isDaemonRunning, sendRequest } from "@usecanary/daemon-client";
import type { SessionEndRequest, SessionEndResult } from "@usecanary/protocol";
import { logger } from "../logger.js";
import { writeSessionReport } from "../report/load-and-render.js";
import { endResultFromDisk } from "../session/artifacts.js";
import { readSessionRecord, updateSessionRecord } from "../session/registry.js";
import { stopDaemonIfIdle } from "./daemon-stop.js";

interface SessionAbortOpts {
  stopDaemon?: boolean;
}

// Best-effort teardown. Flips an active session's on-disk status to "aborted"
// so the registry never shows a zombie "active" session, even if the daemon is
// down; a record that already reached a terminal state is left untouched.
export async function sessionAbort(
  id: string,
  json: boolean,
  opts: SessionAbortOpts = {}
): Promise<number> {
  try {
    await readSessionRecord(id);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 1;
  }

  let result: SessionEndResult | undefined;
  try {
    if (await isDaemonRunning()) {
      const request: SessionEndRequest = {
        id: requestId("session-abort"),
        type: "session-end",
        sessionId: id,
        reason: "abort",
      };
      await sendRequest(request, (data) => {
        result = data as SessionEndResult;
      });
    }
  } catch (err) {
    logger.debug({ err, sessionId: id }, "abort: daemon teardown failed");
  }

  // Only flip an active session to "aborted" — never downgrade a record that
  // already reached a terminal state (a clean "ended", or a prior "aborted"),
  // which would clobber its real endedAt and misreport a successful session.
  const record = await updateSessionRecord(id, (r) => {
    if (r.status === "active") {
      r.status = "aborted";
      r.endedAt = new Date().toISOString();
    }
  });

  // Render a report from whatever artifacts survived (daemon result if we got
  // one, otherwise reconstructed from disk).
  try {
    const endResult = result ?? (await endResultFromDisk(record));
    await writeSessionReport(id, record, endResult);
  } catch (err) {
    logger.debug({ err, sessionId: id }, "abort: report render failed");
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  } else {
    process.stdout.write(`Session ${id} aborted.\n`);
  }

  if (opts.stopDaemon) {
    await stopDaemonIfIdle(id, json);
  }
  return 0;
}
