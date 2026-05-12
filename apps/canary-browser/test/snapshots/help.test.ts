import { describe, expect, it, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { CLI_PATH, runCli } from "../helpers/run-cli.js";

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error("dist/cli.js missing — run `pnpm build` before `pnpm test`");
  }
});

describe("--help content parity", () => {
  it("root --help mentions the sandbox preamble and subcommands", async () => {
    const out = await runCli(["--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("Dev Browser is a CLI for controlling local or external browsers");
    expect(out.stdout).toContain("SANDBOX ENVIRONMENT:");
    expect(out.stdout).toContain("Primary invocation styles:");
    expect(out.stdout).toContain("LLM USAGE GUIDE:");
    for (const sub of ["run", "install", "install-skill", "browsers", "status", "stop"]) {
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

  it("`install-skill --help` lists --claude and --agents", async () => {
    const out = await runCli(["install-skill", "--help"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("--claude");
    expect(out.stdout).toContain("--agents");
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

  it("invalid --timeout yields a clap-style error", async () => {
    const out = await runCli(["--timeout", "0", "run", "/dev/null"]);
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("invalid value '0' for '--timeout <SECONDS>': must be at least 1");
  });

  // Argv-parsing exit codes for unknown subcommands and unsupported options
  // are covered cross-binary in test/parity/binary-diff.test.ts. The check
  // below guards the run.ts -> Rust ENOENT wording path, which has no
  // counterpart in the parity harness's fake-daemon flow.
  it("missing run-file uses POSIX-style wording (Rust parity)", async () => {
    const missing = "/tmp/cli-ts-snap-missing-" + Math.random().toString(36).slice(2);
    const out = await runCli(["run", missing]);
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("No such file or directory (os error 2)");
  });
});
