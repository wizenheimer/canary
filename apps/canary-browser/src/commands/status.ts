import { ensureDaemonRunning } from "../daemon/lifecycle.js";
import { sendRequest } from "../ipc/connect.js";
import { requestId } from "../util/request-id.js";
import { renderStatusResult } from "./render.js";

export async function statusCommand(): Promise<number> {
  await ensureDaemonRunning();
  return sendRequest(
    { id: requestId("status"), type: "status" },
    renderStatusResult
  );
}
