import { execSync, spawn } from "node:child_process";
import { MultiSelect } from "@inkjs/ui";
import { Box, render, Text } from "ink";

interface Cmd {
  args: string[];
  file: string;
}
interface Step {
  commands: Cmd[];
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

// The setup steps, each just shelling out to the published npx commands so this
// wizard stays a thin front-end over the same things you can run by hand.
function buildSteps(): Step[] {
  const hasClaude = claudeAvailable();
  return [
    {
      id: "runtime",
      label: "Install the browser runtime (downloads Chromium)",
      commands: [{ file: "npx", args: ["-y", "@usecanary/cli", "install"] }],
    },
    {
      id: "skills",
      label: "Install the agent skills (any tool — ~/.claude/skills, etc.)",
      commands: [
        { file: "npx", args: ["-y", "skills", "add", "usecanary/canary"] },
      ],
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
        defaultValue={props.steps.map((s) => s.id)}
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
      "  npx @usecanary/cli install         # browser runtime (Chromium)",
      "  npx skills add usecanary/canary  # agent skills (any tool)",
      "  npx @usecanary/ui                  # open the session viewer",
      "",
      "Claude Code plugin:",
      "  /plugin marketplace add usecanary/canary",
      "  /plugin install canary@canary-marketplace",
      "",
    ].join("\n")
  );
}

async function runSelected(steps: Step[], selected: string[]): Promise<void> {
  for (const step of steps) {
    if (!selected.includes(step.id)) {
      continue;
    }
    process.stdout.write(`\n▶ ${step.label}\n`);
    if (step.commands.length === 0) {
      if (step.manualHint) {
        process.stdout.write(`  ${step.manualHint}\n`);
      }
      continue;
    }
    let ok = true;
    for (const cmd of step.commands) {
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
  process.stdout.write(
    "\n✓ Setup complete.\n\n  Open the viewer:  npx @usecanary/ui\n  Demos:            see examples/ in the repo\n\n"
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
