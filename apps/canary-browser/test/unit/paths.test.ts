import { describe, expect, it } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  devBrowserDir,
  daemonSocketPath,
  daemonPidPath,
  daemonBundlePath,
  sandboxClientPath,
  packageJsonPath,
  tmpDir,
  daemonEndpoint,
  SKILL_TARGETS,
  skillRootDir,
  skillDir,
  skillFile,
} from "../../src/paths.js";

describe("paths", () => {
  const home = homedir();

  it("anchors everything under ~/.dev-browser", () => {
    const base = join(home, ".dev-browser");
    expect(devBrowserDir()).toBe(base);
    expect(daemonSocketPath()).toBe(join(base, "daemon.sock"));
    expect(daemonPidPath()).toBe(join(base, "daemon.pid"));
    expect(daemonBundlePath()).toBe(join(base, "daemon.mjs"));
    expect(sandboxClientPath()).toBe(join(base, "sandbox-client.js"));
    expect(packageJsonPath()).toBe(join(base, "package.json"));
    expect(tmpDir()).toBe(join(base, "tmp"));
  });

  it("daemonEndpoint picks platform-specific transport", () => {
    const endpoint = daemonEndpoint();
    if (process.platform === "win32") {
      expect(endpoint.startsWith("\\\\.\\pipe\\dev-browser-daemon-")).toBe(true);
    } else {
      expect(endpoint).toBe(daemonSocketPath());
    }
  });

  it("skill targets cover ~/.claude and ~/.agents", () => {
    expect(SKILL_TARGETS).toHaveLength(2);
    expect(SKILL_TARGETS[0]?.rootRelative).toBe(".claude/skills");
    expect(SKILL_TARGETS[1]?.rootRelative).toBe(".agents/skills");
    for (const t of SKILL_TARGETS) {
      expect(skillRootDir(home, t)).toBe(join(home, t.rootRelative));
      expect(skillDir(home, t)).toBe(join(home, t.rootRelative, "dev-browser"));
      expect(skillFile(home, t)).toBe(join(home, t.rootRelative, "dev-browser", "SKILL.md"));
    }
  });
});
