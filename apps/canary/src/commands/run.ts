import { readFile } from "node:fs/promises";
import { requestId } from "@canary/cli-kit";
import { ensureDaemonRunning, sendRequest } from "@canary/daemon-client";
import type { ExecuteRequest } from "@canary/protocol";
import { withSessionLock } from "../session/lock.js";
import { readSessionRecord, writeSessionRecord } from "../session/registry.js";
import { renderJsonResult } from "./render.js";

// Emit the script's return value as strict JSON under --json (so `| jq` works,
// including string results which renderJsonResult prints unquoted), otherwise
// fall back to the friendly renderer.
function resultRenderer(
  json: boolean
): (data: unknown, stdout: NodeJS.WritableStream) => void {
  if (!json) {
    return renderJsonResult;
  }
  return (data, stdout) => {
    if (data !== null && data !== undefined) {
      stdout.write(`${JSON.stringify(data)}\n`);
    }
  };
}

interface RunArgs {
  file?: string;
  json: boolean;
  script?: string;
  sessionId: string;
  step?: string;
  timeoutMs?: number;
}

export async function runInSession(args: RunArgs): Promise<number> {
  // Fail fast (outside the lock) on an unknown/inactive session and load the
  // script before we serialize on the session.
  const pre = await readSessionRecord(args.sessionId);
  if (pre.status !== "active") {
    process.stderr.write(
      `Session "${args.sessionId}" is ${pre.status}; cannot run new steps.\n`
    );
    return 1;
  }

  let script = args.script;
  if (script === undefined && args.file) {
    try {
      script = await readFile(args.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("No such file or directory (os error 2)");
      }
      throw err;
    }
  }
  // Treat an empty or whitespace-only script (e.g. empty piped stdin or an
  // empty file) as "no script" — a defined-but-falsy "" would otherwise slip
  // past an `=== undefined` check and record a phantom no-op step.
  if (script === undefined || script.trim() === "") {
    process.stderr.write("No script provided (pass a FILE or pipe stdin)\n");
    return 2;
  }
  const scriptText = script;

  // Make sure a daemon is up before we serialize on the session. If it had been
  // stopped/crashed, ensureDaemonRunning starts a fresh one that no longer knows
  // this session, so the execute below is rejected with "No active session" and
  // the reconcile path below marks the record aborted — instead of surfacing a
  // raw ECONNREFUSED and leaving a zombie "active" record behind.
  await ensureDaemonRunning();

  // Hold the session lock across the whole run so the step index / screenshot
  // slug and the step append can't race a concurrent `canary run` on the same
  // session (the daemon already serializes them per browser).
  return withSessionLock(args.sessionId, async () => {
    const record = await readSessionRecord(args.sessionId);
    if (record.status !== "active") {
      process.stderr.write(
        `Session "${args.sessionId}" is ${record.status}; cannot run new steps.\n`
      );
      return 1;
    }

    const stepName = args.step ?? `step-${record.steps.length + 1}`;
    const startedAt = Date.now();
    const request: ExecuteRequest = {
      id: requestId("execute"),
      type: "execute",
      browser: record.browser,
      script: scriptText,
      step: stepName,
    };
    if (args.timeoutMs !== undefined) {
      request.timeoutMs = args.timeoutMs;
    }

    // Capture the daemon's terminal error message separately from the script's
    // own stderr (both would otherwise merge into one stream), so the
    // session-loss check below can't be spoofed by a script that prints
    // "No active session" to stderr and then fails.
    let daemonError = "";
    const code = await sendRequest(
      request,
      resultRenderer(args.json),
      process.stdout,
      process.stderr,
      (message) => {
        daemonError = message;
      }
    );

    // The daemon lost the session (e.g. it restarted). Reconcile the record and
    // do NOT record a phantom step — no script actually ran.
    if (code !== 0 && daemonError.includes("No active session")) {
      record.status = "aborted";
      record.endedAt = new Date().toISOString();
      await writeSessionRecord(record);
      process.stderr.write(
        `Session "${args.sessionId}" is no longer active on the daemon; marked aborted.\n`
      );
      return 1;
    }

    record.steps.push({
      durationMs: Date.now() - startedAt,
      exitCode: code,
      name: stepName,
      ok: code === 0,
      script: scriptText,
      startedAt: new Date(startedAt).toISOString(),
    });
    await writeSessionRecord(record);
    return code;
  });
}
