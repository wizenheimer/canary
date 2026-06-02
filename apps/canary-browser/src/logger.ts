import {
  createLogger,
  type DestinationStream,
  type Logger,
  type LogLevel,
} from "@canary/logger";
import pretty from "pino-pretty";

// `--json` (or CANARY_LOG_JSON=1) forces machine-readable JSON on stderr,
// overriding the interactive pretty default. Peeked from argv because the root
// logger is constructed before commander parses options.
function wantsJsonLogs(): boolean {
  return process.argv.includes("--json") || process.env.CANARY_LOG_JSON === "1";
}

// `--verbose`/`-v` raises the level to debug. Resolved at construction (not via
// a post-parse setter) so child loggers created at import time inherit it. An
// explicit CANARY_LOG_LEVEL always wins.
function resolveCliLevel(): LogLevel | undefined {
  if (process.env.CANARY_LOG_LEVEL) {
    return; // defer to createLogger's env handling
  }
  if (process.argv.includes("--verbose") || process.argv.includes("-v")) {
    return "debug";
  }
  return; // defer to fallbackLevel
}

function buildStream(): DestinationStream | undefined {
  if (wantsJsonLogs()) {
    return;
  }
  // Human-friendly output on an interactive stderr; structured JSON when the
  // stream is piped or running in CI so logs stay machine-readable.
  if (process.stderr.isTTY && !process.env.CI) {
    return pretty({
      colorize: true,
      destination: 2,
      ignore: "pid,hostname",
      sync: true,
      translateTime: "SYS:HH:MM:ss.l",
    }) as unknown as DestinationStream;
  }
  return;
}

// Root CLI logger. Diagnostics go to stderr so stdout stays clean for
// machine-readable command output. Quiet by default (warn); `--verbose`/`-v` or
// CANARY_LOG_LEVEL raises it, `--json` forces structured output. `sync: true`
// guarantees records flush before the CLI calls process.exit().
export const logger: Logger = createLogger({
  destination: 2,
  fallbackLevel: "warn",
  level: resolveCliLevel(),
  name: "canary",
  stream: buildStream(),
  sync: true,
});
