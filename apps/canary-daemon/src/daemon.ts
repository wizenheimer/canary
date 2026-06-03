import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { createLogger } from "@canary/logger";
import {
  EMBEDDED_PACKAGE_JSON,
  type ExecuteRequest,
  parseRequest,
  type Response,
  serialize,
  sessionStepSlug,
} from "@canary/protocol";
import { BrowserManager } from "./browser-manager.js";
import {
  getBrowsersDir,
  getCanaryBaseDir,
  getDaemonEndpoint,
  getPidPath,
  getSessionDir,
  requiresDaemonEndpointCleanup,
} from "./local-endpoint.js";
import { createKeyedLock, createMutex } from "./lock.js";
import { runScript } from "./sandbox/script-runner-quickjs.js";
import { SessionManager, sessionBrowserName } from "./session-manager.js";
import { ensureCanaryTempDir } from "./temp-files.js";

const BASE_DIR = getCanaryBaseDir();
const SOCKET_PATH = getDaemonEndpoint();
const PID_PATH = getPidPath();
const BROWSERS_DIR = getBrowsersDir();
const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000;
const SOCKET_CLOSE_TIMEOUT_MS = 500;

const LOG_PATH = path.join(BASE_DIR, "daemon.log");
const log = createLogger({
  name: "daemon",
  destination: LOG_PATH,
  fallbackLevel: "info",
  // Synchronous writes so error/shutdown records flush before process.exit().
  sync: true,
});

const manager = new BrowserManager(BROWSERS_DIR);
const sessions = new SessionManager(manager, log);
const startedAt = Date.now();
const withBrowserLock = createKeyedLock<string>();
const withInstallLock = createMutex();
const clients = new Set<net.Socket>();

let server: net.Server | null = null;
let shuttingDown: Promise<void> | null = null;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "ScriptTimeoutError") {
      return error.message;
    }
    return error.stack ?? error.message;
  }

  return String(error);
}

async function writeMessage(
  socket: net.Socket,
  message: Response
): Promise<void> {
  if (socket.destroyed) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const payload = serialize(message);
    socket.write(payload, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function closeServerInstance(serverToClose: net.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    serverToClose.close(() => {
      resolve();
    });
  });
}

async function closeClientSocket(socket: net.Socket): Promise<void> {
  if (socket.destroyed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy();
      }
    }, SOCKET_CLOSE_TIMEOUT_MS);
    timeout.unref();

    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    socket.once("close", finish);
    socket.once("error", finish);
    socket.end();
  });
}

function createMessageQueue(socket: net.Socket) {
  let queue = Promise.resolve();

  return {
    push(message: Response): Promise<void> {
      queue = queue
        .then(() => writeMessage(socket, message))
        .catch(() => undefined);
      return queue;
    },
    async drain(): Promise<void> {
      await queue;
    },
  };
}

async function captureStepScreenshot(
  browser: string,
  sessionId: string,
  step: string
): Promise<void> {
  try {
    const shotPath = path.join(
      getSessionDir(sessionId),
      "screenshots",
      `${sessionStepSlug(step)}.png`
    );
    await manager.screenshotActivePage(browser, shotPath);
  } catch (error) {
    log.debug({ err: error, sessionId, step }, "step screenshot failed");
  }
}

// Resolve (connect/launch) the browser for an execute, enforcing the
// session-context guards. Returns false if it already wrote an `error` response
// (the caller should stop). Must run inside withBrowserLock(request.browser).
async function resolveExecuteBrowser(
  socket: net.Socket,
  request: ExecuteRequest,
  targetSession: string | undefined
): Promise<boolean> {
  if (targetSession) {
    // Re-check inside the lock: a concurrent session-end may have torn the
    // session down between the pre-lock guard and acquiring the lock. Without
    // this, ensureBrowser would fabricate a fake non-session browser under the
    // reserved __session__ prefix.
    if (!sessions.has(targetSession)) {
      await writeMessage(socket, {
        id: request.id,
        type: "error",
        message: `No active session "${targetSession}". Start one with \`canary session start\`.`,
      });
      return false;
    }
    // A session owns its capture context; honoring `connect` here would
    // stop/replace it (dropping tracing/video/HAR). Reject instead of hijack.
    if (request.connect) {
      await writeMessage(socket, {
        id: request.id,
        type: "error",
        message: `Session "${targetSession}" manages its own browser; \`connect\` is not allowed for a session run.`,
      });
      return false;
    }
    await manager.ensureBrowser(request.browser, {
      headless: request.headless,
      ignoreHTTPSErrors: request.ignoreHTTPSErrors,
    });
    return true;
  }
  if (request.connect === "auto") {
    await manager.autoConnect(request.browser);
  } else if (request.connect) {
    await manager.connectBrowser(request.browser, request.connect);
  } else {
    await manager.ensureBrowser(request.browser, {
      headless: request.headless,
      ignoreHTTPSErrors: request.ignoreHTTPSErrors,
    });
  }
  return true;
}

async function handleExecute(
  socket: net.Socket,
  request: ExecuteRequest
): Promise<void> {
  // `__session__*` browsers are managed exclusively by session-start. Reject an
  // execute that targets one with no active session (prevents both hijacking a
  // session context and accidentally creating a fake one via ensureBrowser).
  const targetSession = sessions.sessionIdForBrowser(request.browser);
  if (targetSession && !sessions.has(targetSession)) {
    await writeMessage(socket, {
      id: request.id,
      type: "error",
      message: `No active session "${targetSession}". Start one with \`canary session start\`.`,
    });
    return;
  }

  await withBrowserLock(request.browser, async () => {
    if (!(await resolveExecuteBrowser(socket, request, targetSession))) {
      return;
    }

    const output = createMessageQueue(socket);
    const timeoutMs = request.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;

    // A session run is bracketed by a trace group named after the step so the
    // trace timeline is segmented; on success the active page is screenshotted.
    if (targetSession && request.step) {
      await sessions.beginStep(targetSession, request.step);
    }

    try {
      // Inside the try so a failure here is reported as an `error` message
      // with this request's id (and only logged once), the same as any other
      // execute-time failure.
      if (request.initScripts && request.initScripts.length > 0) {
        await manager.applyInitScripts(request.browser, request.initScripts);
      }

      await runScript(
        request.script,
        manager,
        request.browser,
        {
          onStdout: (data) => {
            void output.push({
              id: request.id,
              type: "stdout",
              data,
            });
          },
          onStderr: (data) => {
            void output.push({
              id: request.id,
              type: "stderr",
              data,
            });
          },
        },
        {
          timeout: timeoutMs,
        }
      );

      await output.drain();
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
    } catch (error) {
      await output.drain().catch(() => undefined);
      await writeMessage(socket, {
        id: request.id,
        type: "error",
        message: formatError(error),
      });
    } finally {
      if (targetSession && request.step) {
        // Screenshot the end state for the report's step timeline — on failure
        // too (the steps a reviewer most wants evidence for); best-effort.
        await captureStepScreenshot(
          request.browser,
          targetSession,
          request.step
        );
        await sessions.endStep(targetSession);
      }
      if (targetSession) {
        sessions.noteRun(targetSession);
      }
    }
  });
}

async function handleInstall(
  socket: net.Socket,
  request: { id: string }
): Promise<void> {
  await withInstallLock(async () => {
    const output = createMessageQueue(socket);
    try {
      await mkdir(BASE_DIR, { recursive: true });
      await writeFile(
        path.join(BASE_DIR, "package.json"),
        EMBEDDED_PACKAGE_JSON
      );
      const npmProgram = process.platform === "win32" ? "npm.cmd" : "npm";
      await runInstallCommand(
        output,
        request.id,
        npmProgram,
        ["install"],
        BASE_DIR,
        "npm install"
      );
      await runInstallCommand(
        output,
        request.id,
        npmProgram,
        ["exec", "--", "playwright", "install", "chromium"],
        BASE_DIR,
        "Playwright install"
      );
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
    } catch (error) {
      await output.drain().catch(() => undefined);
      await writeMessage(socket, {
        id: request.id,
        type: "error",
        message: formatError(error),
      });
    }
  });
}

async function runInstallCommand(
  output: ReturnType<typeof createMessageQueue>,
  requestId: string,
  program: string,
  args: string[],
  cwd: string,
  label: string
): Promise<void> {
  const child = spawn(program, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (data: string) => {
    void output.push({
      id: requestId,
      type: "stdout",
      data,
    });
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (data: string) => {
    void output.push({
      id: requestId,
      type: "stderr",
      data,
    });
  });

  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal });
    });
  });

  await output.drain();

  if (result.code === 0) {
    return;
  }

  const reason =
    result.signal === null
      ? `${label} failed with exit code ${result.code ?? "unknown"}`
      : `${label} terminated by signal ${result.signal}`;

  throw new Error(reason);
}

async function handleRequest(socket: net.Socket, line: string): Promise<void> {
  const parsed = parseRequest(line);
  if (!parsed.success) {
    await writeMessage(socket, {
      id: parsed.id ?? "unknown",
      type: "error",
      message: parsed.error,
    });
    return;
  }

  const { request } = parsed;

  log.debug({ id: request.id, type: request.type }, "handling request");

  if (shuttingDown && request.type !== "stop") {
    await writeMessage(socket, {
      id: request.id,
      type: "error",
      message: "Daemon is shutting down",
    });
    return;
  }

  switch (request.type) {
    case "execute":
      await handleExecute(socket, request);
      return;

    case "browsers":
      await writeMessage(socket, {
        id: request.id,
        type: "result",
        data: manager.listBrowsers(),
      });
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
      return;

    case "browser-stop":
      // A raw stopBrowser on a __session__ context would close it without
      // finalizing trace/video/HAR or the manifest, leaving SessionManager
      // pointing at a dead context. Sessions must be torn down via session-end.
      if (sessions.isSessionBrowser(request.browser)) {
        await writeMessage(socket, {
          id: request.id,
          type: "error",
          message: `"${request.browser}" is a session browser; tear it down with \`canary session end\` or \`canary session abort\`.`,
        });
        return;
      }
      await manager.stopBrowser(request.browser);
      log.info({ browser: request.browser }, "browser stopped");
      await writeMessage(socket, {
        id: request.id,
        type: "result",
        data: { browser: request.browser, stopped: true },
      });
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
      return;

    case "status":
      await writeMessage(socket, {
        id: request.id,
        type: "result",
        data: {
          pid: process.pid,
          uptimeMs: Date.now() - startedAt,
          browserCount: manager.browserCount(),
          browsers: manager.listBrowsers(),
          socketPath: SOCKET_PATH,
        },
      });
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
      return;

    case "install":
      await handleInstall(socket, request);
      return;

    case "stop":
      await writeMessage(socket, {
        id: request.id,
        type: "result",
        data: { stopping: true },
      });
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
      void shutdown(0);
      return;

    case "session-start":
      // Locked on the session's reserved browser name so start/end can't race
      // a concurrent execute on the same context.
      await withBrowserLock(sessionBrowserName(request.sessionId), async () => {
        try {
          const session = await sessions.start(request);
          await writeMessage(socket, {
            id: request.id,
            type: "result",
            data: { session },
          });
          await writeMessage(socket, {
            id: request.id,
            type: "complete",
            success: true,
          });
        } catch (error) {
          await writeMessage(socket, {
            id: request.id,
            type: "error",
            message: formatError(error),
          });
        }
      });
      return;

    case "session-end":
      await withBrowserLock(sessionBrowserName(request.sessionId), async () => {
        try {
          const result = await sessions.end(request.sessionId, request.reason);
          await writeMessage(socket, {
            id: request.id,
            type: "result",
            data: result,
          });
          await writeMessage(socket, {
            id: request.id,
            type: "complete",
            success: true,
          });
        } catch (error) {
          await writeMessage(socket, {
            id: request.id,
            type: "error",
            message: formatError(error),
          });
        }
      });
      return;

    case "session-status": {
      const session = sessions.status(request.sessionId);
      if (session) {
        await writeMessage(socket, {
          id: request.id,
          type: "result",
          data: { session },
        });
        await writeMessage(socket, {
          id: request.id,
          type: "complete",
          success: true,
        });
      } else {
        await writeMessage(socket, {
          id: request.id,
          type: "error",
          message: `Session "${request.sessionId}" not found`,
        });
      }
      return;
    }

    case "session-list":
      await writeMessage(socket, {
        id: request.id,
        type: "result",
        data: { sessions: sessions.list() },
      });
      await writeMessage(socket, {
        id: request.id,
        type: "complete",
        success: true,
      });
      return;

    default:
      return;
  }
}

function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return shuttingDown;
  }

  shuttingDown = (async () => {
    log.info({ exitCode }, "daemon shutting down");
    const serverToClose = server;
    server = null;
    const serverClosed = serverToClose
      ? closeServerInstance(serverToClose)
      : Promise.resolve();

    // Flush trace/video/HAR for any active sessions before tearing down their
    // browsers (stopAll would close contexts without finalizing artifacts).
    await sessions.endAll();
    await manager.stopAll();
    await Promise.allSettled(
      Array.from(clients, (socket) => closeClientSocket(socket))
    );
    await serverClosed;
    const cleanup = [unlinkIfExists(PID_PATH)];
    if (requiresDaemonEndpointCleanup()) {
      cleanup.push(unlinkIfExists(SOCKET_PATH));
    }
    await Promise.allSettled(cleanup);

    clients.clear();

    process.exit(exitCode);
  })();

  return shuttingDown;
}

async function start(): Promise<void> {
  await mkdir(BASE_DIR, { recursive: true });
  await ensureCanaryTempDir();
  if (requiresDaemonEndpointCleanup()) {
    await unlinkIfExists(SOCKET_PATH);
  }
  await writeFile(PID_PATH, `${process.pid}\n`);

  server = net.createServer((socket) => {
    if (shuttingDown) {
      socket.end();
      return;
    }

    clients.add(socket);
    socket.setEncoding("utf8");

    let buffer = "";
    let queue = Promise.resolve();

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        queue = queue
          .then(() => handleRequest(socket, line))
          .catch(async (error) => {
            log.error({ err: error }, "request handling error");
            if (!socket.destroyed) {
              await writeMessage(socket, {
                id: "unknown",
                type: "error",
                message: formatError(error),
              });
            }
          });
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
    });

    socket.on("error", () => {
      clients.delete(socket);
    });
  });

  server.on("error", (error) => {
    log.error({ err: error }, "daemon server error");
    void shutdown(1);
  });

  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(SOCKET_PATH, () => {
      server?.off("error", reject);
      resolve();
    });
  });

  log.info({ socket: SOCKET_PATH, pid: process.pid }, "daemon ready");
}

function registerShutdownHandlers(): void {
  const handleSignal = () => {
    void shutdown(0);
  };

  const handleFatalError = (error: unknown) => {
    log.error({ err: error }, "fatal daemon error");
    void shutdown(1);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  process.on("SIGHUP", handleSignal);
  process.on("uncaughtException", handleFatalError);
  process.on("unhandledRejection", handleFatalError);
}

registerShutdownHandlers();

start().catch((error) => {
  log.error({ err: error }, "failed to start daemon");
  void shutdown(1);
});
