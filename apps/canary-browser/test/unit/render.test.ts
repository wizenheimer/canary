import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  renderBrowsersResult,
  renderStatusResult,
} from "../../src/commands/render.js";

function capture(fn: (stream: NodeJS.WritableStream) => void): string {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on("data", (c) => chunks.push(c));
  fn(out);
  return Buffer.concat(chunks).toString("utf8");
}

describe("renderBrowsersResult", () => {
  it("prints 'No browsers.' on empty list", () => {
    expect(capture((s) => renderBrowsersResult([], s))).toBe("No browsers.\n");
  });

  it("renders aligned columns and joins pages", () => {
    const data = [
      { name: "default", type: "launched", status: "running", pages: [] },
      {
        name: "my-proj",
        type: "connected",
        status: "ready",
        pages: ["login", "cart"],
      },
    ];
    const out = capture((s) => renderBrowsersResult(data, s));
    expect(out).toBe(
      "NAME     TYPE       STATUS   PAGES\n" +
        "default  launched   running  -\n" +
        "my-proj  connected  ready    login, cart\n"
    );
  });
});

describe("renderStatusResult", () => {
  it("renders all fields and Managed line when browsers present", () => {
    const data = {
      pid: 1234,
      uptimeMs: 65_000,
      browserCount: 1,
      socketPath: "/tmp/daemon.sock",
      browsers: [
        { name: "default", type: "launched", status: "running", pages: [] },
      ],
    };
    const out = capture((s) => renderStatusResult(data, s));
    expect(out).toBe(
      "PID: 1234\n" +
        "Uptime: 1m 5s\n" +
        "Browsers: 1\n" +
        "Socket: /tmp/daemon.sock\n" +
        "Managed: default (launched, running)\n"
    );
  });

  it("omits Managed line when no browsers", () => {
    const data = {
      pid: 99,
      uptimeMs: 500,
      browserCount: 0,
      socketPath: "/tmp/daemon.sock",
      browsers: [],
    };
    const out = capture((s) => renderStatusResult(data, s));
    expect(out).toBe(
      "PID: 99\nUptime: 500ms\nBrowsers: 0\nSocket: /tmp/daemon.sock\n"
    );
  });
});
