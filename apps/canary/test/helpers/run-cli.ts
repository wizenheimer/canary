import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CLI_PATH = resolve(__dirname, "../../dist/cli.js");

export interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

// Spawn the built CLI and collect its output. Minimal sibling of
// apps/canary-browser/test/helpers/run-cli.ts (no fake-daemon machinery —
// the snapshot tests here only exercise `--help`).
export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  binary: string = CLI_PATH
): Promise<CliResult> {
  const isJs = binary.endsWith(".js");
  const child = spawn(
    isJs ? process.execPath : binary,
    isJs ? [binary, ...args] : args,
    {
      env: { ...env, FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (c) => out.push(c));
  child.stderr.on("data", (c) => err.push(c));
  const code: number = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (c) => resolveExit(c ?? 0));
  });
  return {
    stdout: Buffer.concat(out).toString("utf8"),
    stderr: Buffer.concat(err).toString("utf8"),
    code,
  };
}
