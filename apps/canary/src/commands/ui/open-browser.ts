import { spawn } from "node:child_process";
import { logger } from "../../logger.js";

// Open a URL in the platform default browser without adding a dependency.
// Detached + unref so the browser outlives this short-lived command; failures
// (headless CI, missing xdg-open) are non-fatal — the URL is already printed.
export function openBrowser(url: string): void {
  let command: string;
  let args: string[];
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    // The empty "" is the (required) window title so a URL isn't mis-parsed.
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", (err) => logger.debug({ err }, "openBrowser failed"));
    child.unref();
  } catch (err) {
    logger.debug({ err }, "openBrowser failed");
  }
}
