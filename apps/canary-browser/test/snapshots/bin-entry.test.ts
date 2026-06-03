import { existsSync } from "node:fs";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, runCli } from "../helpers/run-cli.js";

beforeAll(() => {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      "dist/cli.js missing — run `pnpm build` before `pnpm test`"
    );
  }
});

// Regression: npm/npx install the bin as a symlink `.bin/canary-browser ->
// dist/cli.js`, so `process.argv[1]` is the symlink path, not `…/cli.js`. The
// old isMain guard used `argv1.endsWith("cli.js")` (plus loose string matches),
// which is false for that path — so the installed bin exited 0 with NO output.
// The realpath-based guard resolves the symlink back to dist/cli.js and runs.
describe.skipIf(process.platform === "win32")(
  "bin entry via symlink (npm .bin/ parity)",
  () => {
    it("runs --help when invoked through a non-cli.js symlink", async () => {
      const dir = await mkdtemp(join(tmpdir(), "cb-bin-"));
      const link = join(dir, "canary-browser");
      await symlink(CLI_PATH, link);
      try {
        const out = await runCli(["--help"], process.env, link);
        expect(out.code).toBe(0);
        expect(out.stdout.length).toBeGreaterThan(0);
        expect(out.stdout).toContain("SANDBOX ENVIRONMENT:");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
);
