import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  DAEMON_RUNTIME_DEPENDENCIES,
  EMBEDDED_PACKAGE_JSON,
} from "@usecanary/protocol";
import { DAEMON_BUNDLE, SANDBOX_CLIENT } from "../assets/embedded.generated.js";
import {
  canaryDir,
  daemonBundlePath,
  packageJsonPath,
  sandboxClientPath,
} from "../paths.js";

const DAEMON_BUNDLE_TEXT: string = DAEMON_BUNDLE;
const SANDBOX_CLIENT_TEXT: string = SANDBOX_CLIENT;
const PACKAGE_JSON_TEXT: string = EMBEDDED_PACKAGE_JSON;

// Write the embedded daemon bundle, sandbox client, and package.json
// template into ~/.canary/ if missing or stale. Returns the daemon bundle path.
export async function ensureDaemonExtracted(): Promise<string> {
  const dir = canaryDir();
  await mkdir(dir, { recursive: true });

  const daemonPath = daemonBundlePath();
  const sandboxPath = sandboxClientPath();
  const pkgPath = packageJsonPath();

  await Promise.all([
    syncTextFile(daemonPath, DAEMON_BUNDLE_TEXT),
    syncTextFile(sandboxPath, SANDBOX_CLIENT_TEXT),
    syncTextFile(pkgPath, PACKAGE_JSON_TEXT),
  ]);

  return daemonPath;
}

// Returns true if the npm-managed runtime has been installed (i.e.
// `canary install` has been run). The set checked is derived from the single
// source of truth (DAEMON_RUNTIME_DEPENDENCIES), so a new runtime dependency is
// gated automatically without editing this allowlist.
export async function embeddedRuntimeInstalled(
  baseDir: string
): Promise<boolean> {
  const deps = Object.keys(DAEMON_RUNTIME_DEPENDENCIES);
  const installed = await Promise.all(
    deps.map((pkg) => dependencyInstalled(baseDir, pkg))
  );
  return installed.every(Boolean);
}

async function dependencyInstalled(
  baseDir: string,
  pkg: string
): Promise<boolean> {
  try {
    await readFile(`${baseDir}/node_modules/${pkg}/package.json`);
    return true;
  } catch {
    return false;
  }
}

async function syncTextFile(path: string, contents: string): Promise<void> {
  try {
    const existing = await readFile(path, "utf8");
    if (existing === contents) {
      return;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw new Error(`Failed to inspect ${path}: ${(err as Error).message}`);
    }
  }
  await writeFile(path, contents);
}
