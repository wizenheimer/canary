import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../helpers/run-cli.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cli-ts-skill-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

async function run(args: string[]) {
  return runCli(args, { ...process.env, HOME: home, USERPROFILE: home });
}

describe("install-skill", () => {
  it("--claude installs to ~/.claude/skills only", async () => {
    const out = await run(["install-skill", "--claude"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain(
      "Installed dev-browser skill to ~/.claude/skills/dev-browser/SKILL.md"
    );
    const file = join(home, ".claude/skills/dev-browser/SKILL.md");
    expect(statSync(file).isFile()).toBe(true);
    const content = readFileSync(file, "utf8");
    expect(content.length).toBeGreaterThan(10);
    expect(() => statSync(join(home, ".agents"))).toThrow();
  });

  it("--agents installs to ~/.agents/skills only", async () => {
    const out = await run(["install-skill", "--agents"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("~/.agents/skills/dev-browser/SKILL.md");
    expect(statSync(join(home, ".agents/skills/dev-browser/SKILL.md")).isFile()).toBe(true);
  });

  it("--claude --agents installs to both", async () => {
    const out = await run(["install-skill", "--claude", "--agents"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("~/.claude/skills/dev-browser/SKILL.md");
    expect(out.stdout).toContain("~/.agents/skills/dev-browser/SKILL.md");
  });

  it("no flags + non-TTY installs to both", async () => {
    const out = await run(["install-skill"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("~/.claude/skills/dev-browser/SKILL.md");
    expect(out.stdout).toContain("~/.agents/skills/dev-browser/SKILL.md");
  });

  it("idempotent: second install reports already-installed", async () => {
    await run(["install-skill", "--claude"]);
    const out = await run(["install-skill", "--claude"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("already installed");
  });

  it("updates when content changes", async () => {
    await run(["install-skill", "--claude"]);
    const file = join(home, ".claude/skills/dev-browser/SKILL.md");
    writeFileSync(file, "STALE");
    const out = await run(["install-skill", "--claude"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("Updated dev-browser skill");
    expect(readFileSync(file, "utf8")).not.toBe("STALE");
  });

  it("creates ~/.claude/skills with announce", async () => {
    const out = await run(["install-skill", "--claude"]);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("Created ~/.claude/skills");
  });
});
