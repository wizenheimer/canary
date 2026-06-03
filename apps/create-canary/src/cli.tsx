import { execSync, spawn } from "node:child_process";
import { MultiSelect } from "@inkjs/ui";
import { Box, render, Text } from "ink";

interface Cmd {
  args: string[];
  file: string;
}
interface Step {
  commands: Cmd[];
  defaultSelected?: boolean;
  id: string;
  label: string;
  manualHint?: string;
}

function claudeAvailable(): boolean {
  try {
    execSync(
      process.platform === "win32" ? "where claude" : "command -v claude",
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

// The setup steps, each just shelling out to the same published commands you can
// run by hand. The global installs (`cli-global` etc.) put `canary`,
// `canary-browser`, and `canary-viewer` on PATH so day-to-day use drops the npx.
function buildSteps(): Step[] {
  const hasClaude = claudeAvailable();
  return [
    {
      id: "cli-global",
      label: "Install the `canary` command globally (so you can skip npx)",
      commands: [{ file: "npm", args: ["i", "-g", "@usecanary/cli"] }],
      defaultSelected: true,
    },
    {
      id: "runtime",
      label: "Install the browser runtime (downloads Chromium)",
      commands: [{ file: "npx", args: ["-y", "@usecanary/cli", "install"] }],
      defaultSelected: true,
    },
    {
      id: "browser-global",
      label: "Also install `canary-browser` globally (one-off automation)",
      commands: [{ file: "npm", args: ["i", "-g", "@usecanary/browser"] }],
      defaultSelected: false,
    },
    {
      id: "ui-global",
      label: "Also install the session viewer `canary-viewer` globally",
      commands: [{ file: "npm", args: ["i", "-g", "@usecanary/ui"] }],
      defaultSelected: false,
    },
    {
      id: "skills",
      label: "Install the agent skills (any tool — ~/.claude/skills, etc.)",
      commands: [
        { file: "npx", args: ["-y", "skills", "add", "usecanary/canary"] },
      ],
      defaultSelected: true,
    },
    {
      id: "plugin",
      label: hasClaude
        ? "Install the Claude Code plugin (slash commands)"
        : "Claude Code plugin (manual — Claude CLI not found)",
      commands: hasClaude
        ? [
            {
              file: "claude",
              args: ["plugin", "marketplace", "add", "usecanary/canary"],
            },
            {
              file: "claude",
              args: ["plugin", "install", "canary@canary-marketplace"],
            },
          ]
        : [],
      manualHint:
        "/plugin marketplace add usecanary/canary   then   /plugin install canary@canary-marketplace",
      defaultSelected: true,
    },
  ];
}

function runInherit(cmd: Cmd): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd.file, cmd.args, {
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function SelectStep(props: {
  steps: Step[];
  onSubmit: (ids: string[]) => void;
}) {
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">
          canary setup
        </Text>
        <Text dimColor>Browser automation + recorded QA sessions.</Text>
      </Box>
      <Text>Choose what to set up (space toggles, enter confirms):</Text>
      <MultiSelect
        defaultValue={props.steps
          .filter((s) => s.defaultSelected)
          .map((s) => s.id)}
        onSubmit={props.onSubmit}
        options={props.steps.map((s) => ({ label: s.label, value: s.id }))}
      />
    </Box>
  );
}

function printManual(): void {
  process.stdout.write(
    [
      "",
      "canary setup — run these:",
      "",
      "  npm i -g @usecanary/cli            # adds the `canary` command",
      "  canary install                     # browser runtime (Chromium)",
      "  npx skills add usecanary/canary  # agent skills (any tool)",
      "",
      "Optional:",
      "  npm i -g @usecanary/browser        # canary-browser (one-off automation)",
      "  npm i -g @usecanary/ui             # canary-viewer (session viewer)",
      "",
      "Then:",
      "  canary session start --name checkout",
      "  canary-viewer                      # browse recorded sessions",
      "",
      "Claude Code plugin:",
      "  /plugin marketplace add usecanary/canary",
      "  /plugin install canary@canary-marketplace",
      "",
    ].join("\n")
  );
}

async function runSelected(steps: Step[], selected: string[]): Promise<void> {
  // Once `canary` is on PATH we use it directly instead of `npx` for the
  // runtime download, so the wizard demonstrates the same no-npx flow it sets up.
  const cliGlobal = selected.includes("cli-global");
  for (const step of steps) {
    if (!selected.includes(step.id)) {
      continue;
    }
    process.stdout.write(`\n▶ ${step.label}\n`);
    const commands =
      step.id === "runtime" && cliGlobal
        ? [{ file: "canary", args: ["install"] }]
        : step.commands;
    if (commands.length === 0) {
      if (step.manualHint) {
        process.stdout.write(`  ${step.manualHint}\n`);
      }
      continue;
    }
    let ok = true;
    for (const cmd of commands) {
      const code = await runInherit(cmd);
      if (code !== 0) {
        ok = false;
        break;
      }
    }
    process.stdout.write(
      ok ? "  ✓ done\n" : "  ✗ failed — you can re-run this step later\n"
    );
  }
  const viewer = selected.includes("ui-global")
    ? "canary-viewer"
    : "npm i -g @usecanary/ui   # then: canary-viewer";
  process.stdout.write(
    [
      "",
      "✓ Setup complete.",
      "",
      "  Record a session:  canary session start --name checkout",
      `  Open the viewer:   ${viewer}`,
      "  Demos:             see examples/ in the repo",
      "",
      "",
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const steps = buildSteps();
  // Ink needs a real terminal; in pipes/CI just print the commands.
  if (!process.stdin.isTTY) {
    printManual();
    return;
  }

  let selected: string[] = [];
  let dismiss: () => void = () => process.exit(0);
  const app = render(
    <SelectStep
      onSubmit={(ids) => {
        selected = ids;
        dismiss();
      }}
      steps={steps}
    />
  );
  dismiss = () => app.unmount();
  await app.waitUntilExit();

  if (selected.length === 0) {
    process.stdout.write("Nothing selected.\n");
    return;
  }
  await runSelected(steps, selected);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `create-canary: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
