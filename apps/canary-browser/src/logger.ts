import { createRootLogger } from "@usecanary/cli-kit";
import type { Logger } from "@usecanary/logger";

// Root CLI logger. Diagnostics go to stderr; stdout stays clean for
// machine-readable output. See @usecanary/cli-kit createRootLogger.
export const logger: Logger = createRootLogger("canary-browser");
