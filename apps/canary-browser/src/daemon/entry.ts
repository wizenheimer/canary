import { realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { devBrowserDir } from "../paths.js";
import { ensureDaemonExtracted } from "./extract.js";
import type { DaemonCommand } from "./spawn.js";

// Resolve the daemon launch command. Honors DEV_BROWSER_DAEMON env var
// for custom entrypoints (mirror cli/src/daemon.rs find_daemon_command).
export async function findDaemonCommand(): Promise<DaemonCommand> {
  const override = process.env.DEV_BROWSER_DAEMON;
  if (override && override.length > 0) {
    return commandFromEntry(override);
  }
  const bundle = await ensureDaemonExtracted();
  return {
    program: "node",
    args: [bundle],
    workdir: devBrowserDir(),
    requiresRuntimeInstall: true,
  };
}

async function commandFromEntry(entry: string): Promise<DaemonCommand> {
  const abs = isAbsolute(entry) ? entry : resolve(entry);
  let resolved: string;
  try {
    resolved = await realpath(abs);
  } catch (err) {
    throw new Error(`Failed to resolve DEV_BROWSER_DAEMON entry ${abs}: ${(err as Error).message}`);
  }
  const parent = dirname(resolved);
  if (!parent || parent === "." || parent === resolved) {
    throw new Error("Daemon entrypoint has no parent directory");
  }
  const ext = extname(resolved); // includes the dot, case-sensitive — matches Rust

  switch (ext) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return {
        program: "node",
        args: [resolved],
        workdir: parent,
        requiresRuntimeInstall: false,
      };
    case ".ts":
    case ".mts":
    case ".cts": {
      const tsxCli = await findTsxCli(resolved);
      return {
        program: "node",
        args: [tsxCli, resolved],
        workdir: parent,
        requiresRuntimeInstall: false,
      };
    }
    default:
      return {
        program: resolved,
        args: [],
        workdir: parent,
        requiresRuntimeInstall: false,
      };
  }
}

async function findTsxCli(entry: string): Promise<string> {
  let dir = dirname(entry);
  while (true) {
    const candidate = join(dir, "node_modules", "tsx", "dist", "cli.mjs");
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // try parent
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate the tsx runtime required to launch the TypeScript daemon.");
}
