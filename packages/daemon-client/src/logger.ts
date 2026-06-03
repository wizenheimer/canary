import { createLogger, type Logger } from "@canary/logger";

// Package-local diagnostics logger. Structured (no pino-pretty) so the package
// stays free of any app-specific logging concerns and survives esbuild bundling
// in consumers. Goes to stderr (fd 2) so stdout stays clean for machine output.
// Quiet by default (warn); CANARY_LOG_LEVEL raises it. `sync: true` guarantees
// records flush before a CLI calls process.exit().
export const logger: Logger = createLogger({
  destination: 2,
  fallbackLevel: "warn",
  name: "daemon-client",
  sync: true,
});
