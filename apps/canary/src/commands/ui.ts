import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { sessionsRootDir } from "@usecanary/daemon-client";
import { logger } from "../logger.js";
import { openBrowser } from "./ui/open-browser.js";
import { resolveUiServer } from "./ui/resolve-server.js";

const log = logger.child({ component: "ui" });

// Astro dev cold-start can exceed the daemon's 5s; give the server room.
const READY_DEADLINE_MS = 20_000;
const POLL_INTERVAL_MS = 150;

export interface UiArgs {
  dir?: string;
  host?: string;
  json: boolean;
  open: boolean;
  port?: number;
}

// Ask the OS for a free port by binding :0, so we know the URL up front (for
// the readiness poll + opening the browser) instead of letting the server pick.
function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      srv.close(() =>
        port ? resolve(port) : reject(new Error("no free port"))
      );
    });
  });
}

async function waitForReady(
  url: string,
  child: ChildProcess
): Promise<boolean> {
  const deadline = Date.now() + READY_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return false;
    }
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) {
        return true;
      }
    } catch {
      // server not accepting connections yet
    }
  }
  return false;
}

// Launch the @usecanary/ui web app in the FOREGROUND (unlike the detached daemon):
// the user is actively viewing it, expects Ctrl-C to stop it, and shouldn't be
// left with an orphaned server. Returns the child's exit code.
export async function uiCommand(args: UiArgs): Promise<number> {
  const host = args.host ?? "127.0.0.1";
  const root = args.dir ? path.resolve(args.dir) : sessionsRootDir();

  const resolved = await resolveUiServer();
  if (!resolved) {
    process.stderr.write(
      "canary ui: could not locate the @usecanary/ui app. Build it with `pnpm --filter @usecanary/ui build`, or set CANARY_UI_SERVER.\n"
    );
    return 1;
  }

  let port: number;
  try {
    port = args.port ?? (await findFreePort(host));
  } catch (err) {
    log.error({ err }, "could not allocate a port");
    process.stderr.write("canary ui: could not allocate a port.\n");
    return 1;
  }

  const url = `http://${host}:${port}`;
  const baseEnv = { ...process.env, CANARY_UI_ROOT: root };

  let child: ChildProcess;
  if (resolved.kind === "standalone") {
    child = spawn(process.execPath, [resolved.serverEntry], {
      cwd: path.dirname(resolved.serverEntry),
      // Astro's node adapter reads HOST (the old Next server read HOSTNAME).
      env: { ...baseEnv, HOST: host, PORT: String(port) },
      stdio: ["ignore", "inherit", "inherit"],
    });
  } else {
    process.stderr.write(
      "canary ui: no production build found; starting the dev server (slower first paint). Run `pnpm --filter @usecanary/ui build` for fast startup.\n"
    );
    child = spawn(
      process.execPath,
      [resolved.astroBin, "dev", "--port", String(port), "--host", host],
      {
        cwd: resolved.workspaceDir,
        env: baseEnv,
        stdio: ["ignore", "inherit", "inherit"],
      }
    );
  }

  // Forward Ctrl-C / termination so the child dies with us (no orphan). A
  // user-initiated shutdown exits cleanly (0); only an unexpected server crash
  // surfaces a non-zero code.
  let shuttingDown = false;
  const onSignal = () => {
    shuttingDown = true;
    child.kill("SIGTERM");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const exited = new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(shuttingDown ? 0 : (code ?? 0)));
    child.on("error", (err) => {
      log.error({ err }, "ui server failed to start");
      resolve(1);
    });
  });

  const ready = await waitForReady(url, child);
  if (!ready) {
    child.kill("SIGTERM");
    await exited;
    process.stderr.write("canary ui: server did not become ready in time.\n");
    return 1;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ port, root, url })}\n`);
  } else {
    process.stdout.write(
      `canary ui listening on ${url}\n  source: ${root}\n  Press Ctrl-C to stop.\n`
    );
  }
  if (args.open) {
    openBrowser(url);
  }

  return await exited;
}
