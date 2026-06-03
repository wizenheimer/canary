import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, runCli } from "../helpers/run-cli.js";

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      "dist/cli.js missing — run `pnpm build` before `pnpm test`"
    );
  }
});

describe("--help content", () => {
  it("root --help mentions the sandbox preamble and subcommands", async () => {
    const out = await runCli(["--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(
      "Dev Browser is a CLI for controlling local or external browsers"
    );
    expect(out.stdout).toContain("SANDBOX ENVIRONMENT:");
    expect(out.stdout).toContain("Primary invocation styles:");
    expect(out.stdout).toContain("LLM USAGE GUIDE:");
    for (const sub of ["run", "install", "browsers", "status", "stop"]) {
      expect(out.stdout).toContain(sub);
    }
    for (const flag of [
      "--browser",
      "--connect",
      "--headless",
      "--ignore-https-errors",
      "--timeout",
    ]) {
      expect(out.stdout).toContain(flag);
    }
  });

  it("`run --help` describes the FILE argument", async () => {
    const out = await runCli(["run", "--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("Run a script file against the browser");
    expect(out.stdout).toContain("FILE");
  });

  it.each([
    ["install", "Install Playwright browsers"],
    ["browsers", "List all managed browser instances"],
    ["status", "Show daemon status"],
    ["stop", "Stop the daemon and all browsers"],
  ])("`%s --help` includes %s", async (sub, fragment) => {
    const out = await runCli([sub, "--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(fragment);
  });

  it("invalid --timeout yields a usage error", async () => {
    const out = await runCli(["--timeout", "0", "run", "/dev/null"]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain(
      "invalid value '0' for '--timeout <SECONDS>': must be at least 1"
    );
  });

  // Guards the run.ts ENOENT wording path: a missing run-file reports the
  // canonical POSIX-style "No such file or directory (os error 2)" message.
  it("missing run-file uses POSIX-style wording", async () => {
    const missing = `/tmp/cli-ts-snap-missing-${Math.random().toString(36).slice(2)}`;
    const out = await runCli(["run", missing]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("No such file or directory (os error 2)");
  });
});
