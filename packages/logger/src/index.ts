import type { DestinationStream, Level, Logger, LoggerOptions } from "pino";
import pino from "pino";

/** A pino log level, including the special "silent" sentinel. */
export type LogLevel = Level | "silent";

const VALID_LEVELS: ReadonlySet<string> = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]);

export interface CreateLoggerOptions {
  /** Extra static bindings merged into every record (via a child logger). */
  base?: Record<string, unknown>;
  /**
   * Destination file path or file descriptor. Used only when `stream` is not
   * provided. Defaults to fd 2 (stderr) so stdout stays clean for program output.
   */
  destination?: string | number;
  /** Level used when neither `level` nor `CANARY_LOG_LEVEL` is set. Default: "info". */
  fallbackLevel?: LogLevel;
  /** Explicit level. Overrides the `CANARY_LOG_LEVEL` environment variable. */
  level?: LogLevel;
  /** Base `name` binding attached to every record (e.g. "daemon", "canary"). */
  name?: string;
  /** pino redaction paths, e.g. `["req.headers.authorization"]`. */
  redact?: string[];
  /**
   * Pre-built destination stream (e.g. a pino-pretty stream). Takes precedence
   * over `destination`. Lets callers opt into pretty output without this package
   * depending on pino-pretty (and without pulling worker-thread transports into
   * an esbuild bundle).
   */
  stream?: DestinationStream;
  /** Synchronous writes. Default: false (buffered, faster). */
  sync?: boolean;
}

/** Resolve the effective log level from options then `CANARY_LOG_LEVEL` then fallback. */
export function resolveLevel(opts: CreateLoggerOptions = {}): LogLevel {
  if (opts.level) {
    return opts.level;
  }
  const fromEnv = process.env.CANARY_LOG_LEVEL?.trim().toLowerCase();
  if (fromEnv && VALID_LEVELS.has(fromEnv)) {
    return fromEnv as LogLevel;
  }
  return opts.fallbackLevel ?? "info";
}

/**
 * Create a structured pino logger.
 *
 * Worker-free by design: it uses `pino.destination()` rather than a transport,
 * so it survives esbuild bundling in both the daemon and the CLI. Pretty-printing
 * is the caller's responsibility via `stream` (keeps this package's dependency
 * surface to just pino).
 *
 * Defaults to stderr (fd 2) so structured logs never pollute a program's stdout.
 */
export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const options: LoggerOptions = {
    level: resolveLevel(opts),
    timestamp: pino.stdTimeFunctions.isoTime,
    // Serialize `err`/`error` bindings into structured { type, message, stack }.
    serializers: { err: pino.stdSerializers.err },
    formatters: {
      // Log the level name ("info") instead of the numeric code (30).
      level: (label) => ({ level: label }),
    },
  };
  if (opts.name) {
    options.name = opts.name;
  }
  if (opts.redact) {
    options.redact = opts.redact;
  }

  const stream =
    opts.stream ??
    pino.destination({
      dest: opts.destination ?? 2,
      sync: opts.sync ?? false,
      mkdir: true,
    });

  const logger = pino(options, stream);
  return opts.base ? logger.child(opts.base) : logger;
}

export type { DestinationStream, Level, Logger } from "pino";
