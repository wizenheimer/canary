import { installDaemonRuntime } from "@canary/daemon-client";

// Install Playwright + runtime deps under ~/.canary/. Delegates to the
// shared daemon-client implementation (same runtime the daemon embeds).
export function installRuntime(): Promise<number> {
  return installDaemonRuntime();
}
