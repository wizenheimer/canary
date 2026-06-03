import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getBrowsersDir,
  getCanaryBaseDir,
  getDaemonEndpoint,
  getPidPath,
  requiresDaemonEndpointCleanup,
} from "./local-endpoint.js";

describe("local endpoint helpers", () => {
  it("builds filesystem-backed daemon paths on unix-like platforms", () => {
    const homedir = "/Users/tester";

    expect(getCanaryBaseDir(homedir)).toBe(path.join(homedir, ".canary"));
    expect(getDaemonEndpoint({ homedir, platform: "darwin" })).toBe(
      path.join(homedir, ".canary", "daemon.sock")
    );
    expect(getPidPath(homedir)).toBe(
      path.join(homedir, ".canary", "daemon.pid")
    );
    expect(getBrowsersDir(homedir)).toBe(
      path.join(homedir, ".canary", "browsers")
    );
    expect(requiresDaemonEndpointCleanup("linux")).toBe(true);
  });

  it("builds a user-scoped named pipe path on Windows", () => {
    expect(
      getDaemonEndpoint({
        homedir: "C:\\Users\\Tester",
        platform: "win32",
        username: "Tester Name",
      })
    ).toBe("\\\\.\\pipe\\canary-daemon-tester-name");
    expect(requiresDaemonEndpointCleanup("win32")).toBe(false);
  });
});
