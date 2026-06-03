import {
  currentDaemonPid,
  isDaemonRunning,
  sendRequest,
  waitForDaemonExit,
} from "@canary/daemon-client";
import { requestId } from "../util/request-id.js";

export async function stopCommand(): Promise<number> {
  if (!(await isDaemonRunning())) {
    process.stdout.write("Daemon is not running.\n");
    return 0;
  }
  const pid = await currentDaemonPid();
  const code = await sendRequest(
    { id: requestId("stop"), type: "stop" },
    undefined
  );
  if (code === 0) {
    if (pid !== null) {
      await waitForDaemonExit(pid, 10_000);
    }
    process.stdout.write("Daemon stopped.\n");
  }
  return code;
}
