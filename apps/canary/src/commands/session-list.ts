import { reconcileStaleActiveSessions } from "../session/reconcile.js";
import { listSessions } from "../session/registry.js";
import { renderSessionList } from "./render.js";

export async function sessionList(json: boolean): Promise<number> {
  // Correct any zombie "active" records (daemon restarted) before listing, so
  // the output reflects what the daemon actually still has running.
  await reconcileStaleActiveSessions();
  const records = await listSessions();
  if (json) {
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
  } else {
    renderSessionList(records, process.stdout);
  }
  return 0;
}
