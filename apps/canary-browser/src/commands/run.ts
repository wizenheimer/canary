import { readFile } from "node:fs/promises";
import type { ExecuteRequest } from "@canary/protocol";
import { ensureDaemonRunning } from "../daemon/lifecycle.js";
import { readInjectScripts } from "../inject-scripts.js";
import { sendRequest } from "../ipc/connect.js";
import { requestId } from "../util/request-id.js";
import type { GlobalFlags } from "./flags.js";
import { renderJsonResult } from "./render.js";

export async function runScript(
  flags: GlobalFlags,
  script: string
): Promise<number> {
  await ensureDaemonRunning();

  const timeoutSeconds = flags.timeout;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1) {
    throw new Error(
      `invalid value '${flags.timeout}' for '--timeout <SECONDS>': must be at least 1`
    );
  }
  const timeoutMs = timeoutSeconds * 1000;

  const initScripts = await readInjectScripts(
    flags.injectScriptPaths,
    process.cwd()
  );

  const request: ExecuteRequest = {
    id: requestId("execute"),
    type: "execute",
    browser: flags.browser,
    script,
    timeoutMs,
  };
  if (flags.headless) {
    request.headless = true;
  }
  if (flags.ignoreHttpsErrors) {
    request.ignoreHTTPSErrors = true;
  }
  if (flags.connect !== undefined) {
    request.connect = flags.connect;
  }
  if (initScripts.length > 0) {
    request.initScripts = initScripts;
  }

  return sendRequest(request, renderJsonResult);
}

export async function runScriptFromFile(
  flags: GlobalFlags,
  file: string
): Promise<number> {
  let script: string;
  try {
    script = await readFile(file, "utf8");
  } catch (err) {
    // Rust formats io::Error as "No such file or directory (os error 2)";
    // map ENOENT to match exactly (cli/src/main.rs:249).
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("No such file or directory (os error 2)");
    }
    throw err;
  }
  return runScript(flags, script);
}
