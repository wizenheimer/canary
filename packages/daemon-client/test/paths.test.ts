import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canaryDir,
  daemonBundlePath,
  daemonEndpoint,
  daemonPidPath,
  daemonSocketPath,
  packageJsonPath,
  sandboxClientPath,
  sessionDir,
  sessionManifestPath,
  sessionRecordPath,
  sessionReportPath,
  sessionsRootDir,
  tmpDir,
} from "../src/paths.js";

describe("paths", () => {
  const home = homedir();
  const base = join(home, ".canary");

  it("anchors everything under ~/.canary", () => {
    expect(canaryDir()).toBe(base);
    expect(daemonSocketPath()).toBe(join(base, "daemon.sock"));
    expect(daemonPidPath()).toBe(join(base, "daemon.pid"));
    expect(daemonBundlePath()).toBe(join(base, "daemon.mjs"));
    expect(sandboxClientPath()).toBe(join(base, "sandbox-client.js"));
    expect(packageJsonPath()).toBe(join(base, "package.json"));
    expect(tmpDir()).toBe(join(base, "tmp"));
  });

  it("daemonEndpoint picks platform-specific transport", () => {
    const endpoint = daemonEndpoint();
    if (process.platform === "win32") {
      expect(endpoint.startsWith("\\\\.\\pipe\\canary-daemon-")).toBe(true);
    } else {
      expect(endpoint).toBe(daemonSocketPath());
    }
  });

  it("derives the session artifact layout under ~/.canary/sessions/<id>", () => {
    const sessions = join(base, "sessions");
    expect(sessionsRootDir()).toBe(sessions);
    expect(sessionDir("demo-1")).toBe(join(sessions, "demo-1"));
    expect(sessionRecordPath("demo-1")).toBe(
      join(sessions, "demo-1", "session.json")
    );
    expect(sessionManifestPath("demo-1")).toBe(
      join(sessions, "demo-1", "manifest.json")
    );
    expect(sessionReportPath("demo-1")).toBe(
      join(sessions, "demo-1", "report.html")
    );
  });
});
