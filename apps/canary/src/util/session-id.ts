import { randomBytes } from "node:crypto";
import { sanitizePipeSegment } from "@canary/daemon-client";

// Filesystem-safe, collision-resistant session id. Doubles as the on-disk
// directory name and the reserved `__session__<id>` browser key. The prefix is
// capped well under the protocol's 128-char SessionIdSchema limit so a long
// --name can't produce an over-length id.
export function generateSessionId(name?: string): string {
  const base = name?.trim() ? name : "session";
  // sanitizePipeSegment keeps dots, so a --name with consecutive dots would
  // produce an id the daemon's SessionIdSchema (/^(?!.*\.\.).../) rejects.
  // Collapse runs of dots to one and trim leading/trailing dots & dashes so any
  // --name yields a schema-valid, non-hidden id.
  const cleaned = sanitizePipeSegment(base)
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 100)
    .replace(/[.-]+$/g, "");
  const prefix = cleaned === "" ? "session" : cleaned;
  const stamp = Date.now().toString(36);
  const rand = randomBytes(3).toString("hex");
  return `${prefix}-${stamp}-${rand}`;
}
