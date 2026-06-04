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

// `canary --help` and `canary run --help` must be fully self-contained for an
// AI agent writing step scripts: the sandbox rules, the `browser.*` script
// API, and the scripting guide all render inline (composed from
// @usecanary/cli-kit), with no dead-end pointer to the separately-installed
// `canary-browser` binary and no engine-only flags leaking in.
describe("--help content", () => {
  it("root --help is self-contained: lifecycle, sandbox, API, both guides", async () => {
    const out = await runCli(["--help"]);
    expect(out.code).toBe(0);

    // Session orchestration framing.
    expect(out.stdout).toContain("THE SESSION LIFECYCLE:");
    expect(out.stdout).toContain("WHAT IS CAPTURED");

    // The shared scripting reference renders inline.
    expect(out.stdout).toContain("SANDBOX ENVIRONMENT:");
    expect(out.stdout).toContain("This is NOT Node.js");
    expect(out.stdout).toContain("Script API available inside every script:");
    expect(out.stdout).toContain("browser.getPage(nameOrId)");
    expect(out.stdout).toContain("https://playwright.dev/docs/api/class-page");

    // Both after-help guides, workflow first.
    expect(out.stdout).toContain("SESSION WORKFLOW GUIDE:");
    expect(out.stdout).toContain("SCRIPTING GUIDE:");
    expect(out.stdout.indexOf("SESSION WORKFLOW GUIDE:")).toBeLessThan(
      out.stdout.indexOf("SCRIPTING GUIDE:")
    );

    // Guide content an agent needs: discovery, methods table, examples in
    // canary's own invocation style.
    expect(out.stdout).toContain("snapshotForAI");
    expect(out.stdout).toContain("Common Playwright Page methods:");
    expect(out.stdout).toContain('canary run --session "$id" --step');

    for (const sub of [
      "session",
      "run",
      "status",
      "ui",
      "install",
      "init",
      "stop",
      "daemon",
    ]) {
      expect(out.stdout).toContain(sub);
    }
  });

  it("root --help has no dead-end pointer and no engine-only flags", async () => {
    const out = await runCli(["--help"]);
    expect(out.code).toBe(0);

    // The old indirection ("see `canary-browser --help` for the full
    // reference") must be gone — canary-browser may not even be installed.
    // (The additive "use `canary-browser run` for one-offs" tip is fine.)
    expect(out.stdout).not.toContain("see `canary-browser --help`");
    expect(out.stdout).not.toContain("canary-browser --help");

    // Engine-only material must not leak into the orchestrator's help.
    expect(out.stdout).not.toContain("--connect");
    expect(out.stdout).not.toContain("--browser ");
    expect(out.stdout).not.toContain("Connecting to a running Chrome instance");
  });

  it("`run --help` carries the full scripting reference and step semantics", async () => {
    const out = await runCli(["run", "--help"]);
    expect(out.code).toBe(0);

    // Step semantics.
    expect(out.stdout).toContain("Run a script as one step inside a session");
    expect(out.stdout).toContain("auto-captured screenshot");
    expect(out.stdout).toContain("persist across steps");

    // The full sandbox + script API reference, at the point of need.
    expect(out.stdout).toContain("SANDBOX ENVIRONMENT:");
    expect(out.stdout).toContain("browser.getPage(nameOrId)");
    expect(out.stdout).toContain("browser.newPage()");
    expect(out.stdout).toContain("browser.listPages()");
    expect(out.stdout).toContain("browser.closePage(name)");
    expect(out.stdout).toContain("saveScreenshot");
    expect(out.stdout).toContain("writeFile");
    expect(out.stdout).toContain("readFile");
    expect(out.stdout).toContain("https://playwright.dev/docs/api/class-page");

    // Own options documented.
    expect(out.stdout).toContain("--session");
    expect(out.stdout).toContain("--step");
    expect(out.stdout).toContain("--timeout");

    // Self-contained: no reference to the engine CLI at all.
    expect(out.stdout).not.toContain("canary-browser");
    expect(out.stdout).not.toContain("--connect");
  });
});
