import { mkdir, readFile, stat } from "node:fs/promises";
import checkbox from "@inquirer/checkbox";
import { atomicWrite } from "../skill/atomic.js";
import {
  home,
  SKILL_TARGETS,
  type SkillTarget,
  skillRootDir,
  skillDir,
  skillFile,
} from "../paths.js";

import { SKILL_MD } from "../assets/embedded.generated.js";
const SKILL_MD_TEXT: string = SKILL_MD;

type SyncResult = "installed" | "updated" | "already";

export type Selection = { kind: "prompt" } | { kind: "explicit"; indexes: number[] };

// Replicates cli/src/skill.rs resolve_install_target_selection.
export function resolveSelection(
  installClaude: boolean,
  installAgents: boolean,
  interactiveTerminal: boolean
): Selection {
  if (installClaude || installAgents) {
    const indexes: number[] = [];
    if (installClaude) indexes.push(0);
    if (installAgents) indexes.push(1);
    return { kind: "explicit", indexes };
  }
  if (interactiveTerminal) return { kind: "prompt" };
  return {
    kind: "explicit",
    indexes: SKILL_TARGETS.map((_, i) => i),
  };
}

export function interactiveTerminalAvailable(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stderr.isTTY);
}

interface InstallSkillOptions {
  claude: boolean;
  agents: boolean;
}

export async function installSkillCommand(opts: InstallSkillOptions): Promise<number> {
  const selection = resolveSelection(opts.claude, opts.agents, interactiveTerminalAvailable());

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
    if (!target) continue;
    const result = await installTarget(homeDir, target);
    switch (result) {
      case "installed":
        process.stdout.write(`Installed dev-browser skill to ${target.fileDisplay}\n`);
        break;
      case "updated":
        process.stdout.write(`Updated dev-browser skill at ${target.fileDisplay}\n`);
        break;
      case "already":
        process.stdout.write(`dev-browser skill is already installed at ${target.fileDisplay}\n`);
        break;
    }
  }

  return 0;
}

async function promptForTargets(): Promise<number[] | null> {
  try {
    const picked = await checkbox<number>({
      message: "Select skill directories to install dev-browser into",
      choices: SKILL_TARGETS.map((t, i) => ({
        name: t.promptLabel,
        value: i,
        checked: true,
      })),
    });
    return picked;
  } catch (err) {
    // @inquirer throws ExitPromptError on ^C; mirror Rust's "Cancelled."
    if (err && typeof err === "object" && (err as Error).name === "ExitPromptError") {
      return null;
    }
    throw err;
  }
}

async function installTarget(homeDir: string, target: SkillTarget): Promise<SyncResult> {
  const rootDir = skillRootDir(homeDir, target);
  await ensureDirectory(rootDir, target.rootDisplay, true);

  const dir = skillDir(homeDir, target);
  await ensureDirectory(dir, target.promptLabel.replace(/\/$/, ""), false);

  const file = skillFile(homeDir, target);
  return syncSkillFile(file);
}

async function ensureDirectory(
  path: string,
  displayPath: string,
  announceCreate: boolean
): Promise<void> {
  const info = await statOrNull(path, displayPath);
  if (info) {
    if (info.isDirectory()) return;
    throw new Error(`${displayPath} exists but is not a directory.`);
  }
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    throw new Error(`Failed to create ${displayPath}: ${(err as Error).message}`);
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
  if (existing === SKILL_MD_TEXT) return "already";
  await atomicWrite(path, SKILL_MD_TEXT);
  return "updated";
}

async function statOrNull(path: string, displayPath: string) {
  try {
    return await stat(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Failed to inspect ${displayPath}: ${(err as Error).message}`);
  }
}
