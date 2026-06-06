// Help prose for the `canary-browser` engine CLI. The sandbox rules, script
// API, and LLM usage guide come from @usecanary/cli-kit — the single source of
// truth shared with the `canary` orchestrator — so the two CLIs' help cannot
// drift. Only the intro, the invocation styles, and the connect/browser-flag
// material are engine-specific.
import {
  browserExample,
  buildScriptingGuide,
  PLAYWRIGHT_PAGE_NOTE,
  SANDBOX_ENVIRONMENT,
  SCRIPT_API,
} from "@usecanary/cli-kit";

// Engine-specific: how to invoke canary-browser (heredoc, run FILE, --browser,
// --connect). The shared guide's examples reuse the heredoc style.
const INVOCATION_STYLES = `Primary invocation styles:
  canary-browser <<'EOF'
    const page = await browser.getPage("main");
    await page.goto("https://example.com");
    console.log(await page.title());
  EOF

  canary-browser run script.js
  canary-browser --browser my-project < script.js
  canary-browser --connect http://localhost:9222 <<'EOF'
    const page = await browser.getPage("main");
    await page.goto("https://example.com");
  EOF
  canary-browser --connect <<'EOF'
    const page = await browser.getPage("main");
    console.log(await page.title());
  EOF`;

// CLI_LONG_ABOUT prose shown in `--help`.
export const CLI_LONG_ABOUT = `Canary Browser is a CLI for controlling local or external browsers with JavaScript scripts.
Scripts run in a sandboxed QuickJS runtime (not Node.js). Top-level \`await\` is
available, along with a preconnected \`browser\` global and standard \`console\` output.
A background daemon starts automatically when needed and manages browser instances,
named pages, and CDP connections.

${SANDBOX_ENVIRONMENT}

${INVOCATION_STYLES}

${SCRIPT_API}

${PLAYWRIGHT_PAGE_NOTE}`;

// Trailing \n preserved from the retired llm-guide.txt. The guide's content
// now comes from docs/snippets/ (shared with the skills and README), so the
// output is no longer byte-identical to the pre-refactor CLI — the documented
// API facts are, deliberately, the stitched ones.
export const CLI_AFTER_LONG_HELP = `${buildScriptingGuide({
  browserExtras: true,
  example: browserExample,
  heading: "LLM USAGE GUIDE:",
})}\n`;

export const RUN_LONG_ABOUT =
  "Run a script file against the browser.\n\n" +
  "The file is executed the same way as stdin input: as top-level JavaScript with `await`, `browser`, and `console` available.\n\n" +
  "Use top-level flags before `run`, for example `canary-browser --browser my-project run script.js`.";

export const INSTALL_LONG_ABOUT =
  "Install Playwright browsers (Chromium).\n\n" +
  "Downloads the Chromium build used for daemon-managed browser instances.";

export const BROWSERS_LONG_ABOUT =
  "List all managed browser instances.\n\n" +
  "Shows the browser name, whether it is daemon-launched or externally connected, its status, and any named pages currently registered.";

export const STATUS_LONG_ABOUT =
  "Show daemon status.\n\n" +
  "Prints daemon process details, socket path, uptime, and the current set of managed browsers.";

export const STOP_LONG_ABOUT =
  "Stop the daemon and all browsers.\n\n" +
  "This stops the background daemon process and closes every browser instance it currently manages.";

// Subcommand short descriptions.
export const RUN_SHORT = "Run a script file against the browser";
export const INSTALL_SHORT = "Install Playwright browsers (Chromium)";
export const BROWSERS_SHORT = "List all managed browser instances";
export const STATUS_SHORT = "Show daemon status";
export const STOP_SHORT = "Stop the daemon and all browsers";

export const ROOT_SHORT = "Control browsers with JavaScript automation scripts";
