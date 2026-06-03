import { createRootLogger } from "@canary/cli-kit";
import type { Logger } from "@canary/logger";

// Root CLI logger. Diagnostics go to stderr; stdout stays clean for
// machine-readable output. See @canary/cli-kit createRootLogger.
export const logger: Logger = createRootLogger("canary-browser");
