// @usecanary/daemon-client — shared daemon transport, endpoint/paths resolution,
// and daemon lifecycle/extract. Consumed by the `canary` and `canary-browser`
// CLIs so both drive the same daemon and embed the same daemon bundle.

export type { BrowserSummary, StatusSummary } from "@usecanary/protocol";
export { findDaemonCommand } from "./daemon/entry.js";
export {
  embeddedRuntimeInstalled,
  ensureDaemonExtracted,
} from "./daemon/extract.js";
export { installDaemonRuntime } from "./daemon/install.js";
export {
  currentDaemonPid,
  ensureDaemonRunning,
  waitForDaemonExit,
} from "./daemon/lifecycle.js";
export { npmCommand } from "./daemon/npm.js";
export { type DaemonCommand, spawnDaemon } from "./daemon/spawn.js";
export {
  connectToDaemon,
  type DaemonConnection,
  DaemonConnectionClosed,
  isDaemonRunning,
  type ResultRenderer,
  type StreamHandlers,
  sendMessage,
  sendRequest,
  streamResponses,
} from "./ipc/connect.js";
export { daemonPipeName, sanitizePipeSegment } from "./ipc/pipename.js";
export {
  canaryDir,
  daemonBundlePath,
  daemonEndpoint,
  daemonPidPath,
  daemonSocketPath,
  home,
  packageJsonPath,
  sandboxClientPath,
  sessionDir,
  sessionManifestPath,
  sessionRecordPath,
  sessionReportPath,
  sessionResultsPath,
  sessionsRootDir,
  tmpDir,
} from "./paths.js";
