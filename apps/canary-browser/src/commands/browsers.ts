import { ensureDaemonRunning, sendRequest } from "@canary/daemon-client";
import { requestId } from "../util/request-id.js";
import { renderBrowsersResult } from "./render.js";

export async function browsersCommand(): Promise<number> {
  await ensureDaemonRunning();
  return sendRequest(
    { id: requestId("browsers"), type: "browsers" },
    renderBrowsersResult
  );
}
