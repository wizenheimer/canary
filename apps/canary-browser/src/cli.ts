import type { Command as CommandType } from "commander";
import * as commander from "commander";

const { Command, InvalidArgumentError, Option } = commander as unknown as {
  Command: typeof commander.Command;
  InvalidArgumentError: typeof commander.InvalidArgumentError;
  Option: typeof commander.Option;
};

import { browsersCommand } from "./commands/browsers.js";
import {
  CONNECT_AUTO_SENTINEL,
  DEFAULT_BROWSER,
  DEFAULT_TIMEOUT_SECS,
  type GlobalFlags,
} from "./commands/flags.js";
import {
  BROWSERS_LONG_ABOUT,
  BROWSERS_SHORT,
  CLI_AFTER_LONG_HELP,
  CLI_LONG_ABOUT,
  INSTALL_LONG_ABOUT,
  INSTALL_SHORT,
  INSTALL_SKILL_LONG_ABOUT,
  INSTALL_SKILL_SHORT,
  ROOT_SHORT,
  RUN_LONG_ABOUT,
  RUN_SHORT,
  STATUS_LONG_ABOUT,
  STATUS_SHORT,
  STOP_LONG_ABOUT,
  STOP_SHORT,
} from "./commands/help-text.js";
import { installRuntime } from "./commands/install.js";
import { installSkillCommand } from "./commands/install-skill.js";
import { preprocessArgs } from "./commands/preprocess.js";
import { runScript, runScriptFromFile } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { stopCommand } from "./commands/stop.js";
import {
  collectInjectScriptPaths,
  INJECT_SCRIPT_ENV_VAR,
} from "./inject-scripts.js";
import { logger } from "./logger.js";

class ExitCodeError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit code ${code}`);
    this.code = code;
  }
}

interface RawOpts {
  browser: string;
  connect?: string | true;
  headless?: boolean;
  ignoreHttpsErrors?: boolean;
  injectScript?: string[];
  timeout: number;
}

function resolveGlobalFlags(program: CommandType): GlobalFlags {
  const opts = program.opts<RawOpts>();
  const connectRaw = opts.connect;
  let connect: string | undefined;
  if (connectRaw === undefined) {
    connect = undefined;
  } else if (connectRaw === true) {
    connect = CONNECT_AUTO_SENTINEL;
  } else {
    connect = connectRaw;
  }
  return {
    browser: opts.browser,
    connect,
    headless: opts.headless === true,
    ignoreHttpsErrors: opts.ignoreHttpsErrors === true,
    timeout: opts.timeout,
    injectScriptPaths: collectInjectScriptPaths(
      process.env[INJECT_SCRIPT_ENV_VAR],
      opts.injectScript ?? []
    ),
  };
}

function parseTimeout(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== value || parsed < 1) {
    throw new InvalidArgumentError(
      `invalid value '${value}' for '--timeout <SECONDS>': must be at least 1`
    );
  }
  return parsed;
}

function stdinIsTty(): boolean {
  return Boolean(process.stdin.isTTY);
}

async function readScriptFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(
      typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer)
    );
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function buildProgram(): CommandType {
  const program = new Command();
  program
    .name("canary-browser")
    .description(ROOT_SHORT)
    .addHelpText("before", `${CLI_LONG_ABOUT}\n`)
    .addHelpText("after", `\n${CLI_AFTER_LONG_HELP}`)
    .exitOverride()
    .showHelpAfterError(false)
    // Reject `canary-browser bogus` instead of silently no-oping the default
    // action. Commander throws commander.excessArguments which execute()
    // maps to exit 2.
    .allowExcessArguments(false);

  program
    .option(
      "--browser <NAME>",
      "Use a named daemon-managed browser instance",
      DEFAULT_BROWSER
    )
    .addOption(
      new Option("--connect [URL]", "Connect to a running Chrome instance")
    )
    .option(
      "--headless",
      "Launch daemon-managed Chromium without a visible window"
    )
    .option(
      "--ignore-https-errors",
      "Ignore HTTPS certificate errors for daemon-managed Chromium"
    )
    .option(
      "--timeout <SECONDS>",
      "Maximum script execution time in seconds",
      parseTimeout,
      DEFAULT_TIMEOUT_SECS
    )
    .option(
      "--inject-script <PATH>",
      "Pre-load a JavaScript file on every page in the browser context (repeatable)",
      (value: string, previous: string[] = []) => [...previous, value],
      [] as string[]
    )
    .option("-v, --verbose", "Enable verbose diagnostic logging on stderr")
    .option(
      "--json",
      "Emit machine-readable JSON diagnostics on stderr (disable pretty)"
    );

  program.action(async () => {
    if (stdinIsTty()) {
      program.outputHelp();
      throw new ExitCodeError(2);
    }
    const script = await readScriptFromStdin();
    const code = await runScript(resolveGlobalFlags(program), script);
    throw new ExitCodeError(code);
  });

  program
    .command("run")
    .description(RUN_SHORT)
    .summary(RUN_SHORT)
    .addHelpText("before", `${RUN_LONG_ABOUT}\n`)
    .argument("<FILE>", "Path to a JavaScript file to execute")
    .action(async (file: string) => {
      const code = await runScriptFromFile(resolveGlobalFlags(program), file);
      throw new ExitCodeError(code);
    });

  program
    .command("install")
    .description(INSTALL_SHORT)
    .summary(INSTALL_SHORT)
    .addHelpText("before", `${INSTALL_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await installRuntime();
      throw new ExitCodeError(code);
    });

  program
    .command("install-skill")
    .description(INSTALL_SKILL_SHORT)
    .summary(INSTALL_SKILL_SHORT)
    .addHelpText("before", `${INSTALL_SKILL_LONG_ABOUT}\n`)
    .option(
      "--claude",
      "Install the skill into ~/.claude/skills without prompting"
    )
    .option(
      "--agents",
      "Install the skill into ~/.agents/skills without prompting"
    )
    .action(async (opts: { claude?: boolean; agents?: boolean }) => {
      const code = await installSkillCommand({
        claude: opts.claude === true,
        agents: opts.agents === true,
      });
      throw new ExitCodeError(code);
    });

  program
    .command("browsers")
    .description(BROWSERS_SHORT)
    .summary(BROWSERS_SHORT)
    .addHelpText("before", `${BROWSERS_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await browsersCommand();
      throw new ExitCodeError(code);
    });

  program
    .command("status")
    .description(STATUS_SHORT)
    .summary(STATUS_SHORT)
    .addHelpText("before", `${STATUS_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await statusCommand();
      throw new ExitCodeError(code);
    });

  program
    .command("stop")
    .description(STOP_SHORT)
    .summary(STOP_SHORT)
    .addHelpText("before", `${STOP_LONG_ABOUT}\n`)
    .action(async () => {
      const code = await stopCommand();
      throw new ExitCodeError(code);
    });

  return program;
}

export async function execute(argv: readonly string[]): Promise<number> {
  const program = buildProgram();
  const preprocessed = preprocessArgs(argv);
  try {
    await program.parseAsync(preprocessed, { from: "node" });
    return 0;
  } catch (err) {
    if (err instanceof ExitCodeError) {
      return err.code;
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in (err as Record<string, unknown>)
    ) {
      const code = (err as { code?: string }).code;
      if (code === "commander.helpDisplayed" || code === "commander.help") {
        return 0;
      }
      if (code === "commander.version") {
        return 0;
      }
      // Usage errors map to exit 2; commander's own message is already on stderr.
      if (typeof code === "string" && code.startsWith("commander.")) {
        return 2;
      }
    }
    logger.debug({ err }, "command failed");
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }
}

// Direct entry — invoked when run as `node dist/cli.js`.
const isMain = (() => {
  try {
    const here = new URL(import.meta.url).pathname;
    const argv1 = process.argv[1] ?? "";
    return here === argv1 || here.endsWith(argv1) || argv1.endsWith("cli.js");
  } catch {
    return true;
  }
})();

if (isMain) {
  execute(process.argv).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(
        `Error: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
  );
}
