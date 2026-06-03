import { mkdir, readFile, rm, rmdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { home } from "@canary/daemon-client";
import checkbox from "@inquirer/checkbox";
import { SKILL_MD } from "../assets/embedded.generated.js";
import {
  legacySkillDirs,
  SKILL_FILE,
  SKILL_TARGETS,
  type SkillTarget,
  skillDir,
  skillFile,
  skillRootDir,
} from "../paths.js";
import { atomicWrite } from "../skill/atomic.js";

const SKILL_MD_TEXT: string = SKILL_MD;

type SyncResult = "installed" | "updated" | "already";

export type Selection =
  | { kind: "prompt" }
  | { kind: "explicit"; indexes: number[] };

// Resolve which skill directories to install into, given the CLI flags and
// whether we have an interactive terminal.
export function resolveSelection(
  installClaude: boolean,
  installAgents: boolean,
  interactiveTerminal: boolean
): Selection {
  if (installClaude || installAgents) {
    const indexes: number[] = [];
    if (installClaude) {
      indexes.push(0);
    }
    if (installAgents) {
      indexes.push(1);
    }
    return { kind: "explicit", indexes };
  }
  if (interactiveTerminal) {
    return { kind: "prompt" };
  }
  return {
    kind: "explicit",
    indexes: SKILL_TARGETS.map((_, i) => i),
  };
}

export function interactiveTerminalAvailable(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stderr.isTTY);
}

interface InstallSkillOptions {
  agents: boolean;
  claude: boolean;
}

export async function installSkillCommand(
  opts: InstallSkillOptions
): Promise<number> {
  const selection = resolveSelection(
    opts.claude,
    opts.agents,
    interactiveTerminalAvailable()
  );

  let indexes: number[];
  if (selection.kind === "prompt") {
    const picked = await promptForTargets();
    if (picked === null) {
      process.stdout.write("Cancelled.\n");
      return 0;
    }
    indexes = picked;
  } else {
    indexes = selection.indexes;
  }

  if (indexes.length === 0) {
    process.stdout.write("No install targets selected.\n");
    return 0;
  }

  const homeDir = home();

  for (const idx of indexes) {
    const target = SKILL_TARGETS[idx];
    if (!target) {
      continue;
    }
    const result = await installTarget(homeDir, target);
    switch (result) {
      case "installed":
        process.stdout.write(
          `Installed canary skill to ${target.fileDisplay}\n`
        );
        break;
      case "updated":
        process.stdout.write(`Updated canary skill at ${target.fileDisplay}\n`);
        break;
      case "already":
        process.stdout.write(
          `canary skill is already installed at ${target.fileDisplay}\n`
        );
        break;
      default:
        break;
    }
  }

  return 0;
}

async function promptForTargets(): Promise<number[] | null> {
  try {
    const picked = await checkbox<number>({
      message: "Select skill directories to install canary into",
      choices: SKILL_TARGETS.map((t, i) => ({
        name: t.promptLabel,
        value: i,
        checked: true,
      })),
    });
    return picked;
  } catch (err) {
    // @inquirer throws ExitPromptError on ^C; mirror Rust's "Cancelled."
    if (
      err &&
      typeof err === "object" &&
      (err as Error).name === "ExitPromptError"
    ) {
      return null;
    }
    throw err;
  }
}

async function installTarget(
  homeDir: string,
  target: SkillTarget
): Promise<SyncResult> {
  const rootDir = skillRootDir(homeDir, target);
  await ensureDirectory(rootDir, target.rootDisplay, true);

  const dir = skillDir(homeDir, target);
  await ensureDirectory(dir, target.promptLabel.replace(/\/$/, ""), false);

  const file = skillFile(homeDir, target);
  const result = await syncSkillFile(file);
  await removeLegacySkillDirs(homeDir, target);
  return result;
}

// Migrate away earlier releases' skill dirs (e.g. ~/.claude/skills/canary-browser)
// so an agent doesn't load two copies of the same skill. Conservative: remove
// only our own SKILL.md and then the dir if it's now empty — never recursively
// delete a folder that may hold unrelated content.
async function removeLegacySkillDirs(
  homeDir: string,
  target: SkillTarget
): Promise<void> {
  for (const dir of legacySkillDirs(homeDir, target)) {
    await rm(join(dir, SKILL_FILE), { force: true }).catch(() => undefined);
    await rmdir(dir).catch(() => undefined);
  }
}

async function ensureDirectory(
  path: string,
  displayPath: string,
  announceCreate: boolean
): Promise<void> {
  const info = await statOrNull(path, displayPath);
  if (info) {
    if (info.isDirectory()) {
      return;
    }
    throw new Error(`${displayPath} exists but is not a directory.`);
  }
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    throw new Error(
      `Failed to create ${displayPath}: ${(err as Error).message}`
    );
  }
  if (announceCreate) {
    process.stdout.write(`Created ${displayPath}\n`);
  }
}

async function syncSkillFile(path: string): Promise<SyncResult> {
  const info = await statOrNull(path, path);
  if (!info) {
    await atomicWrite(path, SKILL_MD_TEXT);
    return "installed";
  }
  if (!info.isFile()) {
    throw new Error(`${path} exists but is not a file.`);
  }
  const existing = await readFile(path, "utf8");
  if (existing === SKILL_MD_TEXT) {
    return "already";
  }
  await atomicWrite(path, SKILL_MD_TEXT);
  return "updated";
}

async function statOrNull(path: string, displayPath: string) {
  try {
    return await stat(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(
      `Failed to inspect ${displayPath}: ${(err as Error).message}`
    );
  }
}
