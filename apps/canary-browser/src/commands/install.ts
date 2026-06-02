import { spawn } from "node:child_process";
import { ensureDaemonExtracted } from "../daemon/extract.js";
import { npmCommand } from "../daemon/npm.js";
import { devBrowserDir } from "../paths.js";

// Install Playwright + runtime deps under ~/.dev-browser/.
// Mirrors cli/src/daemon.rs install_daemon_runtime and Go InstallRuntime.
export async function installRuntime(): Promise<number> {
  const base = devBrowserDir();
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
    });
    child.on("error", (err) => {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        reject(
          new Error(
            `Could not find \`${program}\` in PATH while setting up the embedded daemon runtime in ${cwd}. Install Node.js/npm and run \`dev-browser install\` again.`
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
