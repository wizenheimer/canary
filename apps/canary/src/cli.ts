import { isMainModule } from "@usecanary/cli-kit";
import type { Command as CommandType } from "commander";
import * as commander from "commander";

const { Command, InvalidArgumentError } = commander as unknown as {
  Command: typeof commander.Command;
  InvalidArgumentError: typeof commander.InvalidArgumentError;
};

import { daemonStop } from "./commands/daemon-stop.js";
import {
  CLI_LONG_ABOUT,
  INIT_LONG_ABOUT,
  INSTALL_LONG_ABOUT,
  RUN_LONG_ABOUT,
  SESSION_END_LONG_ABOUT,
  SESSION_START_LONG_ABOUT,
  STOP_LONG_ABOUT,
  UI_LONG_ABOUT,
  USAGE_GUIDE,
} from "./commands/help-text.js";
import { initCommand } from "./commands/init.js";
import { installCommand } from "./commands/install.js";
import { runInSession } from "./commands/run.js";
import { sessionAbort } from "./commands/session-abort.js";
import { sessionEnd } from "./commands/session-end.js";
import { sessionList } from "./commands/session-list.js";
import { sessionStart } from "./commands/session-start.js";
import { statusCommand } from "./commands/status.js";
import { uiCommand } from "./commands/ui.js";
import { logger } from "./logger.js";

// Injected at build time by scripts/build.mjs (esbuild `define`); falls back to
// a dev sentinel when run unbundled via tsx/vitest.
const VERSION = process.env.CANARY_CLI_VERSION ?? "0.0.0-dev";

class ExitCodeError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit code ${code}`);
    this.code = code;
  }
}

function isJson(program: CommandType): boolean {
  return program.opts<{ json?: boolean }>().json === true;
}

function parseTimeout(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== value || parsed < 1) {
    throw new InvalidArgumentError(
      `invalid value '${value}' for '--timeout <SECONDS>': must be at least 1`
    );
  }
  return parsed;
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isFinite(parsed) ||
    String(parsed) !== value ||
    parsed < 1 ||
    parsed > 65_535
  ) {
    throw new InvalidArgumentError(
      `invalid value '${value}' for '--port <PORT>': must be 1-65535`
    );
  }
  return parsed;
}

function stdinIsTty(): boolean {
  return Boolean(process.stdin.isTTY);
}

async function readScriptFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer)
    );
  }
  return Buffer.concat(chunks).toString("utf8");
}

interface SessionStartOpts {
  console: boolean;
  har: boolean;
  headless?: boolean;
  name?: string;
  trace: boolean;
  video: boolean;
}

interface RunOpts {
  session: string;
  step?: string;
  timeout?: number;
}

interface SessionEndOpts {
  stopDaemon?: boolean;
}

interface UiOpts {
  dir?: string;
  host?: string;
  open?: boolean;
  port?: number;
}

export function buildProgram(): CommandType {
  const program = new Command();
  program
    .name("canary")
    .description(CLI_LONG_ABOUT)
    .version(VERSION, "-V, --version", "Output the version number")
    .exitOverride()
    .showHelpAfterError(false)
    .allowExcessArguments(false)
    .addHelpText("after", `\n${USAGE_GUIDE}`);

  program
    .option("-v, --verbose", "Enable verbose diagnostic logging on stderr")
    .option("--json", "Emit machine-readable JSON on stdout and stderr");

  const session = program
    .command("session")
    .description("Manage capture-enabled browser sessions");

  session
    .command("start")
    .description("Start a session and begin recording artifacts")
    .addHelpText("before", `${SESSION_START_LONG_ABOUT}\n`)
    .option("--name <NAME>", "Human-readable session name")
    .option("--headless", "Launch the session browser without a visible window")
    .option("--no-trace", "Disable Playwright trace capture")
    .option("--no-video", "Disable video recording")
    .option("--no-har", "Disable network HAR capture")
    .option("--no-console", "Disable console / page-error capture")
    .action(async (opts: SessionStartOpts) => {
      const code = await sessionStart({
        name: opts.name,
        headless: opts.headless === true,
        capture: {
          trace: opts.trace,
          video: opts.video,
          har: opts.har,
          console: opts.console,
        },
        json: isJson(program),
      });
      throw new ExitCodeError(code);
    });

  session
    .command("end")
    .description("Stop recording, collect artifacts, and render the report")
    .addHelpText("before", `${SESSION_END_LONG_ABOUT}\n`)
    .argument("<id>", "Session id")
    .option(
      "--stop-daemon",
      "After ending, stop the daemon if no other sessions/browsers remain"
    )
    .action(async (id: string, opts: SessionEndOpts) => {
      const code = await sessionEnd(id, isJson(program), {
        stopDaemon: opts.stopDaemon === true,
      });
      throw new ExitCodeError(code);
    });

  session
    .command("abort")
    .description("Best-effort teardown of a session (artifacts may be partial)")
    .argument("<id>", "Session id")
    .option(
      "--stop-daemon",
      "After aborting, stop the daemon if no other sessions/browsers remain"
    )
    .action(async (id: string, opts: SessionEndOpts) => {
      const code = await sessionAbort(id, isJson(program), {
        stopDaemon: opts.stopDaemon === true,
      });
      throw new ExitCodeError(code);
    });

  session
    .command("list")
    .description("List recorded sessions")
    .action(async () => {
      const code = await sessionList(isJson(program));
      throw new ExitCodeError(code);
    });

  program
    .command("run")
    .description("Run a script as a step inside a session")
    .addHelpText("before", `${RUN_LONG_ABOUT}\n`)
    .argument("[FILE]", "Path to a JavaScript file (reads stdin if omitted)")
    .requiredOption("--session <id>", "Target session id")
    .option("--step <name>", "Step label (defaults to step-N)")
    .option(
      "--timeout <SECONDS>",
      "Maximum script execution time in seconds",
      parseTimeout
    )
    .action(async (file: string | undefined, opts: RunOpts) => {
      let script: string | undefined;
      if (!file) {
        if (stdinIsTty()) {
          program.outputHelp();
          throw new ExitCodeError(2);
        }
        script = await readScriptFromStdin();
      }
      const code = await runInSession({
        sessionId: opts.session,
        step: opts.step,
        file,
        script,
        timeoutMs: opts.timeout === undefined ? undefined : opts.timeout * 1000,
        json: isJson(program),
      });
      throw new ExitCodeError(code);
    });

  program
    .command("status")
    .description("Show session status (or daemon status without --session)")
    .option("--session <id>", "Session id")
    .action(async (opts: { session?: string }) => {
      const code = await statusCommand({
        sessionId: opts.session,
        json: isJson(program),
      });
      throw new ExitCodeError(code);
    });

  program
    .command("ui")
    .description(
      "Launch the local web UI to browse, organize, and search recorded sessions"
    )
    .addHelpText("before", `${UI_LONG_ABOUT}\n`)
    .option(
      "--dir <PATH>",
      "Source folder to open (default: ~/.canary/sessions)"
    )
    .option(
      "--port <PORT>",
      "Port to listen on (default: an open port)",
      parsePort
    )
    .option("--host <HOST>", "Host interface to bind (default: 127.0.0.1)")
    .option("--no-open", "Do not open the browser automatically")
    .action(async (opts: UiOpts) => {
      const code = await uiCommand({
        dir: opts.dir,
        host: opts.host,
        json: isJson(program),
        open: opts.open !== false,
        port: opts.port,
      });
      throw new ExitCodeError(code);
    });

  program
    .command("install")
    .description("Install the embedded daemon runtime (Playwright + sandbox)")
    .addHelpText("before", `${INSTALL_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await installCommand();
      throw new ExitCodeError(code);
    });

  program
    .command("init")
    .description("Set up canary: install the runtime, then print next steps")
    .addHelpText("before", `${INIT_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await initCommand();
      throw new ExitCodeError(code);
    });

  program
    .command("stop")
    .description(
      "Stop the daemon and everything it's running in the background"
    )
    .addHelpText("before", `${STOP_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await daemonStop(isJson(program));
      throw new ExitCodeError(code);
    });

  const daemon = program
    .command("daemon")
    .description("Manage the shared daemon process");

  daemon
    .command("stop")
    .description("Stop the running daemon")
    .action(async () => {
      const code = await daemonStop(isJson(program));
      throw new ExitCodeError(code);
    });

  return program;
}

export async function execute(argv: readonly string[]): Promise<number> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv as string[], { from: "node" });
    return 0;
  } catch (err) {
    if (err instanceof ExitCodeError) {
      return err.code;
    }
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code?: string }).code;
      if (code === "commander.helpDisplayed" || code === "commander.help") {
        return 0;
      }
      if (code === "commander.version") {
        return 0;
      }
      if (typeof code === "string" && code.startsWith("commander.")) {
        return 2;
      }
    }
    logger.debug({ err }, "command failed");
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

// True only when this module is the process entry point (see isMainModule).
const isMain = isMainModule(import.meta.url);

if (isMain) {
  execute(process.argv).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
  );
}
