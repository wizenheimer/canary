import {
  createLogger,
  type DestinationStream,
  type Logger,
  type LogLevel,
} from "@canary/logger";
import pretty from "pino-pretty";

// `${prefix}-${unix_millis}-${pid}` — correlates a daemon request/response pair.
export function requestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${process.pid}`;
}

// Right-pad to `width` for fixed-width table columns.
export function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + " ".repeat(width - value.length);
}

export function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// Pretty-print a command `result` payload: null/undefined skipped, strings
// emitted unquoted, everything else as indented JSON.
export function renderJsonResult(
  data: unknown,
  stdout: NodeJS.WritableStream
): void {
  if (data === null || data === undefined) {
    return;
  }
  if (typeof data === "string") {
    stdout.write(`${data}\n`);
    return;
  }
  stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

// `--json` (or CANARY_LOG_JSON=1) forces machine-readable JSON on stderr,
// overriding the interactive pretty default. Peeked from argv because the root
// logger is constructed before the CLI framework parses options.
function wantsJsonLogs(): boolean {
  return process.argv.includes("--json") || process.env.CANARY_LOG_JSON === "1";
}

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

// Root CLI logger shared by the canary CLIs. Diagnostics go to stderr so stdout
// stays clean for machine-readable output. Quiet by default (warn);
// `--verbose`/`-v` or CANARY_LOG_LEVEL raises it, `--json` forces structured
// output. `sync: true` flushes records before the CLI calls process.exit().
export function createRootLogger(name: string): Logger {
  return createLogger({
    destination: 2,
    fallbackLevel: "warn",
    level: resolveCliLevel(),
    name,
    stream: buildStream(),
    sync: true,
  });
}
