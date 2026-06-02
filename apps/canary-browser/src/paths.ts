import { homedir } from "node:os";
import { join } from "node:path";
import { daemonPipeName } from "./ipc/pipename.js";

const DIR_NAME = ".dev-browser";
const DAEMON_SOCKET = "daemon.sock";
const DAEMON_PID = "daemon.pid";
const DAEMON_BUNDLE = "daemon.mjs";
const SANDBOX_CLIENT = "sandbox-client.js";
const PACKAGE_JSON = "package.json";
const TMP_DIR = "tmp";

export const CLAUDE_SKILLS_REL = ".claude/skills";
export const AGENTS_SKILLS_REL = ".agents/skills";
export const SKILL_SUBDIR = "dev-browser";
export const SKILL_FILE = "SKILL.md";

export function home(): string {
  const dir = homedir();
  if (!dir) {
    throw new Error("Could not determine home directory");
  }
  return dir;
}

export function devBrowserDir(): string {
  return join(home(), DIR_NAME);
}

export function daemonSocketPath(): string {
  return join(devBrowserDir(), DAEMON_SOCKET);
}

export function daemonPidPath(): string {
  return join(devBrowserDir(), DAEMON_PID);
}

export function daemonBundlePath(): string {
  return join(devBrowserDir(), DAEMON_BUNDLE);
}

export function sandboxClientPath(): string {
  return join(devBrowserDir(), SANDBOX_CLIENT);
}

export function packageJsonPath(): string {
  return join(devBrowserDir(), PACKAGE_JSON);
}

export function tmpDir(): string {
  return join(devBrowserDir(), TMP_DIR);
}

// Endpoint path used by net.createConnection / createServer. On POSIX this
// is a Unix domain socket path; on Windows it is a named-pipe path
// (`\\.\pipe\dev-browser-daemon-{user}`) — Node's `net` module accepts both.
export function daemonEndpoint(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${daemonPipeName()}`;
  }
  return daemonSocketPath();
}

export interface SkillTarget {
  fileDisplay: string;
  promptLabel: string;
  rootDisplay: string;
  rootRelative: string;
}

export const SKILL_TARGETS: readonly SkillTarget[] = [
  {
    promptLabel: "~/.claude/skills/dev-browser/",
    rootDisplay: "~/.claude/skills",
    fileDisplay: "~/.claude/skills/dev-browser/SKILL.md",
    rootRelative: CLAUDE_SKILLS_REL,
  },
  {
    promptLabel: "~/.agents/skills/dev-browser/",
    rootDisplay: "~/.agents/skills",
    fileDisplay: "~/.agents/skills/dev-browser/SKILL.md",
    rootRelative: AGENTS_SKILLS_REL,
  },
];

export function skillRootDir(homeDir: string, target: SkillTarget): string {
  return join(homeDir, target.rootRelative);
}

export function skillDir(homeDir: string, target: SkillTarget): string {
  return join(skillRootDir(homeDir, target), SKILL_SUBDIR);
}

export function skillFile(homeDir: string, target: SkillTarget): string {
  return join(skillDir(homeDir, target), SKILL_FILE);
}
