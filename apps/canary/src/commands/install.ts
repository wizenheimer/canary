import { installDaemonRuntime } from "@usecanary/daemon-client";

// Install the embedded daemon runtime (Playwright + sandbox) under
// ~/.canary/. Shared with canary-browser; safe to run repeatedly.
export function installCommand(): Promise<number> {
  return installDaemonRuntime();
}
