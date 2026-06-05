import { installCommand } from "./install.js";

// First-run setup: install the browser runtime, then point the user at the
// agent plugin and the viewer. Skills/agents/commands install via the plugin
// marketplaces (Claude Code / Cursor / Codex) — there is no separate skill
// installer. `create-canary` is the friendlier Ink front-end.
export async function initCommand(): Promise<number> {
  process.stdout.write(
    "Setting up canary…\n\n▶ Installing the browser runtime (Chromium)\n"
  );
  const runtime = await installCommand();
  if (runtime !== 0) {
    return runtime;
  }

  process.stdout.write(
    [
      "",
      "✓ canary is ready.",
      "",
      "  Browse recorded sessions:        canary-viewer   (after: npm i -g @usecanary/ui)",
      "  Claude Code plugin:              /plugin marketplace add wizenheimer/canary",
      "                                   /plugin install canary@canary-marketplace",
      "  Try a demo:                      see examples/ in the repo",
      "",
    ].join("\n")
  );
  return 0;
}
