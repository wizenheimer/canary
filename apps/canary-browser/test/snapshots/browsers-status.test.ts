import { describe, expect, it } from "vitest";
import { runCli, startFakeDaemon } from "../helpers/run-cli.js";

const skip = process.platform === "win32";

describe.skipIf(skip)("browsers/status against fake daemon", () => {
  it("browsers renders aligned table for two browsers", async () => {
    const fake = await startFakeDaemon(function* (req) {
      yield {
        id: req.id,
        type: "result",
        data: [
          { name: "default", type: "launched", status: "running", pages: [] },
          {
            name: "my-proj",
            type: "connected",
            status: "ready",
            pages: ["login", "cart"],
          },
        ],
      };
      yield { id: req.id, type: "complete", success: true };
    });
    if (!fake) {
      return;
    }
    try {
      const out = await runCli(["browsers"], fake.env);
      expect(out.code).toBe(0);
      expect(out.stdout).toBe(
        "NAME     TYPE       STATUS   PAGES\n" +
          "default  launched   running  -\n" +
          "my-proj  connected  ready    login, cart\n"
      );
    } finally {
      await fake.close();
    }
  });

  it("browsers renders 'No browsers.' on empty list", async () => {
    const fake = await startFakeDaemon(function* (req) {
      yield { id: req.id, type: "result", data: [] };
      yield { id: req.id, type: "complete", success: true };
    });
    if (!fake) {
      return;
    }
    try {
      const out = await runCli(["browsers"], fake.env);
      expect(out.code).toBe(0);
      expect(out.stdout).toBe("No browsers.\n");
    } finally {
      await fake.close();
    }
  });

  it("status renders all fields", async () => {
    const fake = await startFakeDaemon(function* (req) {
      yield {
        id: req.id,
        type: "result",
        data: {
          pid: 4242,
          uptimeMs: 125_000,
          browserCount: 1,
          socketPath: "/fake/path/daemon.sock",
          browsers: [
            { name: "default", type: "launched", status: "running", pages: [] },
          ],
        },
      };
      yield { id: req.id, type: "complete", success: true };
    });
    if (!fake) {
      return;
    }
    try {
      const out = await runCli(["status"], fake.env);
      expect(out.code).toBe(0);
      expect(out.stdout).toBe(
        "PID: 4242\n" +
          "Uptime: 2m 5s\n" +
          "Browsers: 1\n" +
          "Socket: /fake/path/daemon.sock\n" +
          "Managed: default (launched, running)\n"
      );
    } finally {
      await fake.close();
    }
  });

  it("error response writes message to stderr and exits 1", async () => {
    const fake = await startFakeDaemon(function* (req) {
      yield { id: req.id, type: "error", message: "boom!" };
    });
    if (!fake) {
      return;
    }
    try {
      const out = await runCli(["browsers"], fake.env);
      expect(out.code).toBe(1);
      expect(out.stderr).toContain("boom!");
    } finally {
      await fake.close();
    }
  });

  it("script execution streams stdout/stderr and respects result type", async () => {
    const fake = await startFakeDaemon(function* (req) {
      yield { id: req.id, type: "stdout", data: "hello\n" };
      yield { id: req.id, type: "stderr", data: "warn\n" };
      yield { id: req.id, type: "result", data: { ok: true } };
      yield { id: req.id, type: "complete", success: true };
    });
    if (!fake) {
      return;
    }
    try {
      const out = await runCli(["run", "/dev/null"], fake.env);
      expect(out.code).toBe(0);
      expect(out.stdout).toBe('hello\n{\n  "ok": true\n}\n');
      expect(out.stderr).toBe("warn\n");
    } finally {
      await fake.close();
    }
  });
});
