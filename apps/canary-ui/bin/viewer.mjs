#!/usr/bin/env node
// The Canary session viewer, runnable straight from npm — the trace-viewer
// pattern, for canary:
//
//   npx @usecanary/ui                    # browse ~/.canary/sessions
//   npx @usecanary/ui --dir ./artifacts  # browse a specific folder
//   npx @usecanary/ui --no-open          # don't auto-open a browser
//
// It spawns the bundled Astro node-standalone server, waits for it, and opens
// a browser — like `npx playwright show-trace`. Self-contained: no daemon, no
// global install, no setup.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const READY_DEADLINE_MS = 20_000;
const POLL_INTERVAL_MS = 150;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Ask the OS for a free port by binding :0, so we know the URL up front (for
// the readiness poll + opening the browser) rather than letting Next pick.
function findFreePort(host) {
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

async function waitForReady(url, child) {
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

function browserOpener(url) {
  if (process.platform === "darwin") {
    return { cmd: "open", args: [url] };
  }
  if (process.platform === "win32") {
    return { cmd: "cmd", args: ["/c", "start", "", url] };
  }
  return { cmd: "xdg-open", args: [url] };
}

function openBrowser(url) {
  const { cmd, args } = browserOpener(url);
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // opening a browser is best-effort
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
// The published package ships the Astro node-standalone server:
//   <pkg>/dist/server/entry.mjs  (serves <pkg>/dist/client/ itself)
const packageRoot = path.join(here, "..");
const serverEntry = path.join(packageRoot, "dist", "server", "entry.mjs");

if (!existsSync(serverEntry)) {
  process.stderr.write(
    "canary viewer: bundled server (dist/server/entry.mjs) not found — this @usecanary/ui install looks incomplete.\n"
  );
  process.exit(1);
}

const host = arg("--host", "127.0.0.1");
const root = path.resolve(
  arg("--dir", path.join(homedir(), ".canary", "sessions"))
);
const portArg = arg("--port");
const port = portArg ? Number(portArg) : await findFreePort(host);
const url = `http://${host}:${port}`;

const child = spawn(process.execPath, [serverEntry], {
  cwd: packageRoot,
  env: {
    ...process.env,
    // Astro's node adapter reads HOST (Next read HOSTNAME).
    HOST: host,
    PORT: String(port),
    CANARY_UI_ROOT: root,
  },
  stdio: ["ignore", "inherit", "inherit"],
});

// Forward Ctrl-C so the server dies with us (no orphan); a user-initiated stop
// exits cleanly, only a real crash surfaces a non-zero code.
let shuttingDown = false;
const stop = () => {
  shuttingDown = true;
  child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(shuttingDown ? 0 : (code ?? 0)));

const ready = await waitForReady(url, child);
if (!ready) {
  child.kill("SIGTERM");
  process.stderr.write("canary viewer: server did not become ready in time.\n");
  process.exit(1);
}

process.stdout.write(
  `canary viewer on ${url}\n  source: ${root}\n  Press Ctrl-C to stop.\n`
);
if (!process.argv.includes("--no-open")) {
  openBrowser(url);
}
