import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentDaemonPid: vi.fn(),
  isDaemonRunning: vi.fn(),
  listSessions: vi.fn(),
  sendRequest: vi.fn(),
  waitForDaemonExit: vi.fn(),
}));

vi.mock("@usecanary/daemon-client", () => ({
  currentDaemonPid: mocks.currentDaemonPid,
  isDaemonRunning: mocks.isDaemonRunning,
  sendRequest: mocks.sendRequest,
  waitForDaemonExit: mocks.waitForDaemonExit,
}));

vi.mock("../session/registry.js", () => ({
  listSessions: mocks.listSessions,
}));

const { daemonStop, stopDaemonIfIdle } = await import("./daemon-stop.js");

let out = "";

beforeEach(() => {
  out = "";
  for (const fn of Object.values(mocks)) {
    fn.mockReset();
  }
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    out += String(chunk);
    return true;
  }) as typeof process.stdout.write);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("daemonStop", () => {
  it("no-ops when the daemon is not running", async () => {
    mocks.isDaemonRunning.mockResolvedValue(false);
    const code = await daemonStop(false);
    expect(code).toBe(0);
    expect(out).toContain("Daemon is not running.");
    expect(mocks.sendRequest).not.toHaveBeenCalled();
  });

  it("sends the stop RPC and waits for exit when running", async () => {
    mocks.isDaemonRunning.mockResolvedValue(true);
    mocks.currentDaemonPid.mockResolvedValue(123);
    mocks.sendRequest.mockResolvedValue(0);
    mocks.waitForDaemonExit.mockResolvedValue(undefined);
    const code = await daemonStop(false);
    expect(code).toBe(0);
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stop" }),
      undefined
    );
    expect(mocks.waitForDaemonExit).toHaveBeenCalledWith(123, 10_000);
    expect(out).toContain("Daemon stopped.");
  });
});

describe("stopDaemonIfIdle", () => {
  it("no-ops when the daemon is already down", async () => {
    mocks.isDaemonRunning.mockResolvedValue(false);
    await stopDaemonIfIdle("me", false);
    expect(mocks.sendRequest).not.toHaveBeenCalled();
  });

  it("leaves the daemon running when another session is active", async () => {
    mocks.isDaemonRunning.mockResolvedValue(true);
    mocks.listSessions.mockResolvedValue([
      { id: "me", status: "ended" },
      { id: "other", status: "active" },
    ]);
    mocks.sendRequest.mockImplementation(
      (_req: unknown, render?: (data: unknown) => void) => {
        render?.({ browserCount: 0 });
        return Promise.resolve(0);
      }
    );
    await stopDaemonIfIdle("me", false);
    expect(out).toContain("Daemon left running");
    // only the status probe was sent — never the stop RPC
    expect(mocks.sendRequest).toHaveBeenCalledTimes(1);
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: "status" }),
      expect.any(Function)
    );
  });

  it("stops the daemon when no other sessions/browsers remain", async () => {
    mocks.isDaemonRunning.mockResolvedValue(true);
    mocks.listSessions.mockResolvedValue([{ id: "me", status: "ended" }]);
    mocks.currentDaemonPid.mockResolvedValue(99);
    mocks.waitForDaemonExit.mockResolvedValue(undefined);
    mocks.sendRequest.mockImplementation(
      (req: { type: string }, render?: (data: unknown) => void) => {
        if (req.type === "status") {
          render?.({ browserCount: 0 });
        }
        return Promise.resolve(0);
      }
    );
    await stopDaemonIfIdle("me", false);
    expect(mocks.sendRequest).toHaveBeenCalledTimes(2);
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: "stop" }),
      undefined
    );
    expect(mocks.waitForDaemonExit).toHaveBeenCalledWith(99, 10_000);
    expect(out).toContain("Daemon stopped.");
  });
});
