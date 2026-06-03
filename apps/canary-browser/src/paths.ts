import { join } from "node:path";

// Daemon/endpoint + session paths live in @canary/daemon-client. This module
// keeps only the skill-install layout, which is specific to canary-browser.

export const CLAUDE_SKILLS_REL = ".claude/skills";
export const AGENTS_SKILLS_REL = ".agents/skills";
export const SKILL_SUBDIR = "canary";
export const SKILL_FILE = "SKILL.md";
// Earlier releases installed under "canary-browser"; install migrates those
// away so an agent doesn't see two copies of the same skill.
export const LEGACY_SKILL_SUBDIRS: readonly string[] = ["canary-browser"];

export interface SkillTarget {
  fileDisplay: string;
  promptLabel: string;
  rootDisplay: string;
  rootRelative: string;
}

export const SKILL_TARGETS: readonly SkillTarget[] = [
  {
    promptLabel: "~/.claude/skills/canary/",
    rootDisplay: "~/.claude/skills",
    fileDisplay: "~/.claude/skills/canary/SKILL.md",
    rootRelative: CLAUDE_SKILLS_REL,
  },
  {
    promptLabel: "~/.agents/skills/canary/",
    rootDisplay: "~/.agents/skills",
    fileDisplay: "~/.agents/skills/canary/SKILL.md",
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

// Legacy skill directories for a target (renamed subdirs from older releases).
export function legacySkillDirs(
  homeDir: string,
  target: SkillTarget
): string[] {
  return LEGACY_SKILL_SUBDIRS.map((sub) =>
    join(skillRootDir(homeDir, target), sub)
  );
}
