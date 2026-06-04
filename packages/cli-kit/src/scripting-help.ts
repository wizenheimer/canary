// Shared scripting-help prose for the `canary` and `canary-browser` CLIs.
// The factual content (sandbox rules, script API, workflow rules, shared
// example bodies) is single-sourced from docs/snippets/ via the generated
// ./snippets.generated.ts module (`make docs` re-stitches it), so it cannot
// drift between the CLIs' --help, the agent skills, and the README. This file
// is the presentation layer: headings, indentation, and the example-bearing
// guide parameterized only by how each CLI is invoked (a heredoc to
// `canary-browser` vs `canary run --session … --step …`).
import {
  API_BROWSER,
  API_CONSOLE,
  API_FILE_HELPERS,
  API_GLOBALS,
  API_PLAYWRIGHT_METHODS,
  API_PLAYWRIGHT_NOTE,
  API_SANDBOX_ENV,
  API_SNAPSHOT,
  EX_INSPECT_TABS,
  EX_SNAPSHOT,
  RULE_DEV_SERVER,
  RULE_OBSERVE_FIRST,
} from "./snippets.generated.js";

// Prefix every non-empty line — used to nest shared blocks under headings.
export const indent = (text: string, prefix: string): string =>
  text
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n");

// The QuickJS sandbox rules: what is NOT available (not Node.js) and which
// globals every script gets.
export const SANDBOX_ENVIRONMENT = `SANDBOX ENVIRONMENT:
${indent(API_SANDBOX_ENV, "  ")}

${indent(API_GLOBALS, "  ")}`;

// The `browser.*` handle plus the file-IO helpers and console semantics.
export const SCRIPT_API = `Script API available inside every script:
${indent(API_BROWSER, "  ")}

${indent(API_FILE_HELPERS, "  ")}

${indent(API_CONSOLE, "  ")}`;

// Pages are full Playwright Page objects — pointer to the upstream API docs.
export const PLAYWRIGHT_PAGE_NOTE = API_PLAYWRIGHT_NOTE;

// The full hard reference: sandbox rules + script API + Playwright pointer.
// Rendered identically wherever a CLI needs the complete scripting contract.
export function sandboxReference(): string {
  return `${SANDBOX_ENVIRONMENT}\n\n${SCRIPT_API}\n\n${PLAYWRIGHT_PAGE_NOTE}`;
}

export interface ExampleOptions {
  // Browser-style invocations: attach to a running Chrome (`--connect`).
  connect?: boolean;
  // Step label for session-style invocations (`canary run … --step <step>`).
  step?: string;
}

// Wraps a script body in a runnable invocation for one CLI. The guide below
// interpolates these so every example is copy-pasteable for the CLI showing it.
export type ExampleWrapper = (
  scriptBody: string,
  opts?: ExampleOptions
) => string;

// canary-browser: heredoc straight to the engine; `--connect` when the example
// targets an already-running Chrome.
export const browserExample: ExampleWrapper = (scriptBody, opts) =>
  [
    `canary-browser${opts?.connect === true ? " --connect" : ""} <<'EOF'`,
    scriptBody,
    "EOF",
  ].join("\n");

// canary: every script runs as one named step inside a session.
export const sessionExample: ExampleWrapper = (scriptBody, opts) =>
  [
    `canary run --session "$id" --step ${opts?.step ?? "<name>"} <<'EOF'`,
    scriptBody,
    "EOF",
  ].join("\n");

export interface ScriptingGuideOptions {
  // Include canary-browser-only material (PowerShell --connect piping, the
  // "Connecting to a running Chrome instance" section, --browser/--connect/
  // --headless tips). Must stay out of canary's help. Default false.
  browserExtras?: boolean;
  // How examples are invoked for this CLI.
  example: ExampleWrapper;
  // Section heading: "LLM USAGE GUIDE:" (canary-browser) / "SCRIPTING GUIDE:" (canary).
  heading: string;
}

// CLI-only example bodies — no markdown twin, so they live here rather than in
// docs/snippets/examples/. Pure sandbox JavaScript.
const INSPECT_PAGE_BODY = `const page = await browser.getPage("TARGET_ID_HERE");
console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
}, null, 2));`;

const SCREENSHOT_BODY = `const page = await browser.getPage("main");
const buf = await page.screenshot();
const path = await saveScreenshot(buf, "debug.png");
console.log(path);`;

const WAITING_BODY = `const page = await browser.getPage("search-results");
await page.waitForSelector(".results");
await page.waitForURL("**/success");
console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
}, null, 2));`;

const ERROR_RECOVERY_BODY = `const page = await browser.getPage("checkout");
const path = await saveScreenshot(await page.screenshot(), "debug.png");
console.log(JSON.stringify({
  screenshot: path,
  url: page.url(),
  title: await page.title(),
}, null, 2));`;

const POWERSHELL_BLOCK = `  On Windows/PowerShell, use here-strings to pipe multiline scripts:
    @"
    const page = await browser.getPage("main");
    console.log(await page.title());
    "@ | canary-browser --connect`;

const CONNECTING_SECTION = `  Connecting to a running Chrome instance:
    Auto-discover Chrome with debugging enabled:
      canary-browser --connect <<'EOF'
        const page = await browser.getPage("main");
        console.log(await page.title());
      EOF

    Connect to a specific CDP endpoint:
      canary-browser --connect http://localhost:9222 <<'EOF'
        const page = await browser.getPage("main");
        console.log(await page.title());
      EOF

    To launch Chrome with debugging enabled:
      chrome.exe --remote-debugging-port=9222
      google-chrome --remote-debugging-port=9222

    Or visit chrome://inspect/#remote-debugging to configure.`;

// The LLM usage guide: best practices + worked examples, with each example
// rendered in the calling CLI's own invocation style.
export function buildScriptingGuide(options: ScriptingGuideOptions): string {
  const { heading, example } = options;
  const browserExtras = options.browserExtras === true;

  const intro = [
    `${heading}`,
    "  Write small, focused scripts. Each script should do ONE thing: navigate, click, fill, or check.",
    "  End each script by logging the state you need for the next decision.",
    '  Use descriptive page names like "login", "checkout", or "results" instead of "page1".',
    '  Named pages from browser.getPage("name") persist between script runs, so you usually do not need to re-navigate.',
    "  Inside page.evaluate(...), write plain JavaScript only - no TypeScript syntax in the browser context.",
    ...(browserExtras ? [POWERSHELL_BLOCK] : []),
  ].join("\n");

  const quickInspection = [
    "  Quick inspection:",
    indent(
      example(EX_INSPECT_TABS, { step: "inspect", connect: true }),
      "    "
    ),
    "",
    indent(
      example(INSPECT_PAGE_BODY, { step: "inspect", connect: true }),
      "    "
    ),
  ].join("\n");

  const aiSnapshots = [
    "  AI snapshots for element discovery:",
    indent(example(EX_SNAPSHOT, { step: "discover" }), "    "),
    "",
    indent(API_SNAPSHOT, "    "),
  ].join("\n");

  const choosingApproach = [
    "  Choosing your approach:",
    indent(RULE_OBSERVE_FIRST, "    "),
  ].join("\n");

  const screenshots = [
    "  Screenshots for visual state:",
    indent(example(SCREENSHOT_BODY, { step: "capture" }), "    "),
  ].join("\n");

  const waiting = [
    "  Waiting patterns:",
    indent(example(WAITING_BODY, { step: "wait" }), "    "),
  ].join("\n");

  const devServer = [
    "  Dev server navigation:",
    indent(RULE_DEV_SERVER, "    "),
  ].join("\n");

  const errorRecovery = [
    "  Error recovery:",
    "    If a script fails, the page usually stays where it stopped.",
    "    Reconnect to the same page name, take a screenshot, and log the URL/title:",
    indent(example(ERROR_RECOVERY_BODY, { step: "recover" }), "    "),
  ].join("\n");

  const playwrightMethods = [
    "  Common Playwright Page methods:",
    indent(API_PLAYWRIGHT_METHODS, "    "),
  ].join("\n");

  const tips = [
    "  Tips:",
    "    - Use console.log(JSON.stringify(...)) for structured output.",
    "    - Prefer page.snapshotForAI() for structure; use screenshots when visual layout or styling matters.",
    "    - Keep page names stable across scripts so you can resume work after failures.",
    ...(browserExtras
      ? [
          "    - Each --browser name maps to a separate daemon-managed browser instance.",
          "    - Use --connect to attach to an existing browser; omit the URL to auto-discover Chrome with debugging enabled.",
        ]
      : []),
    "    - Use short timeouts (--timeout 10) so scripts fail fast instead of hanging on missing elements.",
    ...(browserExtras
      ? [
          "    - Add --headless for unattended automation; omit it when you want to watch the browser window.",
        ]
      : []),
  ].join("\n");

  return [
    intro,
    quickInspection,
    aiSnapshots,
    choosingApproach,
    screenshots,
    waiting,
    devServer,
    errorRecovery,
    playwrightMethods,
    ...(browserExtras ? [CONNECTING_SECTION] : []),
    tips,
  ].join("\n\n");
}
