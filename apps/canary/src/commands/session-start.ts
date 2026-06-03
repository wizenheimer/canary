import { requestId } from "@canary/cli-kit";
import { ensureDaemonRunning, sendRequest } from "@canary/daemon-client";
import type {
  CaptureOptions,
  SessionEndRequest,
  SessionStartRequest,
  SessionStartResult,
} from "@canary/protocol";
import { logger } from "../logger.js";
import {
  createSessionRecord,
  SESSION_SCHEMA_VERSION,
} from "../session/registry.js";
import { generateSessionId } from "../util/session-id.js";

interface SessionStartArgs {
  capture: CaptureOptions;
  headless: boolean;
  json: boolean;
  name?: string;
}

export async function sessionStart(args: SessionStartArgs): Promise<number> {
  await ensureDaemonRunning();

  const id = generateSessionId(args.name);
  const request: SessionStartRequest = {
    id: requestId("session-start"),
    type: "session-start",
    sessionId: id,
    name: args.name,
    headless: args.headless,
    capture: args.capture,
  };

  let result: SessionStartResult | undefined;
  const code = await sendRequest(request, (data) => {
    result = data as SessionStartResult;
  });
  if (code !== 0) {
    return code;
  }
  if (!result) {
    process.stderr.write("Daemon did not return a session\n");
    return 1;
  }

  const { session } = result;
  try {
    await createSessionRecord({
      artifactsDir: session.artifactsDir,
      browser: session.browser,
      capture: session.capture,
      createdAt: new Date(session.startedAt).toISOString(),
      headless: session.headless,
      id,
      name: args.name,
      schemaVersion: SESSION_SCHEMA_VERSION,
      status: "active",
      steps: [],
    });
  } catch (err) {
    // The daemon already launched the live session, but we couldn't persist the
    // local record (disk full / permissions), so the CLI could never manage it
    // (`session list`/`end`/`abort` all key off the on-disk record). Tell the
    // daemon to tear the orphan down instead of leaking a recording browser
    // until daemon shutdown, then surface the original failure.
    const abort: SessionEndRequest = {
      id: requestId("session-abort"),
      type: "session-end",
      sessionId: id,
      reason: "abort",
    };
    await sendRequest(abort, undefined).catch(() => undefined);
    throw err;
  }

  logger.info(
    { sessionId: id, artifactsDir: session.artifactsDir },
    "session started"
  );

  if (args.json) {
    process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
  } else {
    process.stdout.write(`${id}\n`);
  }
  return 0;
}
