import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SKILL_TARGETS,
  skillDir,
  skillFile,
  skillRootDir,
} from "../../src/paths.js";

describe("skill paths", () => {
  const home = homedir();

  it("skill targets cover ~/.claude and ~/.agents", () => {
    expect(SKILL_TARGETS).toHaveLength(2);
    expect(SKILL_TARGETS[0]?.rootRelative).toBe(".claude/skills");
    expect(SKILL_TARGETS[1]?.rootRelative).toBe(".agents/skills");
    for (const t of SKILL_TARGETS) {
      expect(skillRootDir(home, t)).toBe(join(home, t.rootRelative));
      expect(skillDir(home, t)).toBe(join(home, t.rootRelative, "canary"));
      expect(skillFile(home, t)).toBe(
        join(home, t.rootRelative, "canary", "SKILL.md")
      );
    }
  });
});
