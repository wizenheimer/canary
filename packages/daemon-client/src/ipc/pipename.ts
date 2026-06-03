import { homedir } from "node:os";
import { basename, sep } from "node:path";

// Make a value safe for use in a socket/pipe name: keep ASCII letters/digits
// and `. _ -`, replace anything else with `-`, trim leading/trailing `-`,
// lowercase, and fall back to "user" if empty.
export function sanitizePipeSegment(value: string): string {
  const out = value
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return out === "" ? "user" : out;
}

export function currentUserSegment(): string {
  const username = (process.env.USERNAME ?? "").trim();
  if (username !== "") {
    return username;
  }
  const user = (process.env.USER ?? "").trim();
  if (user !== "") {
    return user;
  }
  try {
    const home = homedir();
    if (home) {
      const base = basename(home);
      if (base !== "." && base !== sep) {
        return base;
      }
    }
  } catch {
    // fall through
  }
  return "user";
}

export function daemonPipeName(): string {
  return `canary-daemon-${sanitizePipeSegment(currentUserSegment())}`;
}
