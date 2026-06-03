import os from "node:os";
import path from "node:path";

function sanitizePipeSegment(value: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return sanitized.length > 0 ? sanitized : "user";
}

function getDefaultUsername(homedir: string): string {
  const fromEnv = process.env.USERNAME || process.env.USER;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv;
  }

  try {
    const username = os.userInfo().username;
    if (username.trim().length > 0) {
      return username;
    }
  } catch {
    // Fall back to the home directory name.
  }

  return path.basename(homedir) || "user";
}

export function getCanaryBaseDir(homedir = os.homedir()): string {
  return path.join(homedir, ".canary");
}

export function getDaemonEndpoint(
  options: {
    homedir?: string;
    platform?: NodeJS.Platform;
    username?: string;
  } = {}
): string {
  const homedir = options.homedir ?? os.homedir();
  const platform = options.platform ?? process.platform;

  if (platform === "win32") {
    const username = sanitizePipeSegment(
      options.username ?? getDefaultUsername(homedir)
    );
    return `\\\\.\\pipe\\canary-daemon-${username}`;
  }

  return path.join(getCanaryBaseDir(homedir), "daemon.sock");
}

export function getPidPath(homedir = os.homedir()): string {
  return path.join(getCanaryBaseDir(homedir), "daemon.pid");
}

export function getBrowsersDir(homedir = os.homedir()): string {
  return path.join(getCanaryBaseDir(homedir), "browsers");
}

export function getSessionsDir(homedir = os.homedir()): string {
  return path.join(getCanaryBaseDir(homedir), "sessions");
}

export function getSessionDir(
  sessionId: string,
  homedir = os.homedir()
): string {
  return path.join(getSessionsDir(homedir), sessionId);
}

export function requiresDaemonEndpointCleanup(
  platform = process.platform
): boolean {
  return platform !== "win32";
}
