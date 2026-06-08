import { spawn } from "node:child_process";
import { canaryDir } from "../paths.js";
import { ensureDaemonExtracted } from "./extract.js";
import { npmCommand } from "./npm.js";

// Install Playwright + runtime deps under ~/.canary/. Extracts the
// embedded daemon bundle, then `npm install` + `playwright install chromium`.
// Shared by the `canary` and `canary-browser` CLIs.
export async function installDaemonRuntime(): Promise<number> {
  const base = canaryDir();
  await ensureDaemonExtracted();
  const npm = npmCommand();
  await runInstall(npm, ["install"], base);
  await runInstall(
    npm,
    ["exec", "--", "playwright", "install", "chromium"],
    base
  );
  return 0;
}

function runInstall(
  program: string,
  args: string[],
  cwd: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.on("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        reject(
          new Error(
            `Could not find \`${program}\` in PATH while setting up the embedded daemon runtime in ${cwd}. Install Node.js/npm and re-run the install command.`
          )
        );
        return;
      }
      reject(
        new Error(
          `Failed to run \`${program} ${args.join(" ")}\` in ${cwd}: ${err.message}`
        )
      );
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      if (signal) {
        reject(
          new Error(`\`${program} ${args.join(" ")}\` terminated by signal`)
        );
        return;
      }
      reject(
        new Error(
          `\`${program} ${args.join(" ")}\` failed with exit code ${code ?? "?"}`
        )
      );
    });
  });
}
