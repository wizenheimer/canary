import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { runInherit } = await import("../src/run.js");

const realPlatform = process.platform;
function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

beforeEach(() => {
  spawnMock.mockReset();
  // Fake child process that immediately reports a clean exit.
  spawnMock.mockImplementation(() => ({
    on(event: string, cb: (code: number) => void) {
      if (event === "exit") {
        queueMicrotask(() => cb(0));
      }
    },
  }));
});

afterEach(() => setPlatform(realPlatform));

describe("runInherit", () => {
  it("runs .cmd shims through a shell on Windows, string form (CVE-2024-27980, no DEP0190)", async () => {
    setPlatform("win32");
    await runInherit({ file: "npm", args: ["i", "-g", "@usecanary/cli"] });
    // String form (one arg, no args[]) + shell:true: fixes EINVAL and avoids
    // the DEP0190 warning Node prints for shell:true with an args array.
    expect(spawnMock).toHaveBeenCalledWith(
      "npm i -g @usecanary/cli",
      expect.objectContaining({ shell: true, windowsHide: true })
    );
  });

  it("spawns directly without a shell on POSIX (unchanged behavior)", async () => {
    setPlatform("linux");
    await runInherit({ file: "npm", args: ["i", "-g", "@usecanary/cli"] });
    // Separate file + args array, no shell — byte-identical to pre-fix behavior.
    expect(spawnMock).toHaveBeenCalledWith(
      "npm",
      ["i", "-g", "@usecanary/cli"],
      expect.not.objectContaining({ shell: true })
    );
  });
});
