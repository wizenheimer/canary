import { requestId } from "@usecanary/cli-kit";
import { isDaemonRunning, sendRequest } from "@usecanary/daemon-client";
import type {
  SessionListRequest,
  SessionListResult,
} from "@usecanary/protocol";
import { listSessions, updateSessionRecord } from "./registry.js";

// The set of sessions the daemon currently tracks, or null if the daemon is
// down/unreachable (in which case we can't tell a stale record from one the
// daemon would report). The daemon is the authority on live sessions; on-disk
// records are the durable history and can lag after a daemon restart.
async function daemonLiveSessionIds(): Promise<Set<string> | null> {
  if (!(await isDaemonRunning())) {
    return null;
  }
  const request: SessionListRequest = {
    id: requestId("session-list"),
    type: "session-list",
  };
  try {
    let live: Set<string> | null = null;
    await sendRequest(request, (data) => {
      const result = data as SessionListResult;
      live = new Set(result.sessions.map((s) => s.sessionId));
    });
    return live;
  } catch {
    return null;
  }
}

// Reconcile zombie "active" records: when the daemon is running but no longer
// tracks a session marked "active" on disk (it restarted / lost it), flip that
// record to "aborted" so `status`/`list` reflect reality instead of a stale
// "active". No-op when the daemon is down — a daemon-down state can't
// distinguish a genuinely-dead session from a transient outage, and per-session
// `end`/`abort` already handle that path.
export async function reconcileStaleActiveSessions(): Promise<void> {
  const live = await daemonLiveSessionIds();
  if (!live) {
    return;
  }
  const records = await listSessions();
  await Promise.all(
    records
      .filter((r) => r.status === "active" && !live.has(r.id))
      .map((r) =>
        updateSessionRecord(r.id, (rec) => {
          if (rec.status === "active") {
            rec.status = "aborted";
            rec.endedAt = rec.endedAt ?? new Date().toISOString();
          }
        }).catch(() => undefined)
      )
  );
}
