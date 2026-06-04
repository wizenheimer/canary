// Shared scripting-help prose for the `canary` and `canary-browser` CLIs.
// Single source of truth: both CLIs compose their `--help` output from these
// blocks, so the sandbox rules, script API, and LLM usage guidance cannot
// drift between them. The reference blocks are verbatim-identical in both
// CLIs; the example-bearing guide is parameterized only by how each CLI is
// invoked (a heredoc to `canary-browser` vs `canary run --session … --step …`).

// The QuickJS sandbox rules: what is NOT available (not Node.js) and which
// globals every script gets.
export const SANDBOX_ENVIRONMENT = `SANDBOX ENVIRONMENT:
  Scripts execute inside a QuickJS WASM sandbox with no arbitrary access to the host system.
  This is NOT Node.js — the following are NOT available:
    - require() / import()     No module loading
    - process                  No process access
    - fs / path / os           No direct filesystem access
    - fetch / WebSocket        No direct network access
    - __dirname / __filename   No path globals

  Available globals:
    browser                    Pre-connected browser handle (see API below)
    console                    log, warn, error, info (routed to CLI output)
    setTimeout / clearTimeout  Basic timers
    saveScreenshot(buf, name)  Save a screenshot buffer (async, must be awaited)
    writeFile(name, data)      Write a file to temp dir (async, must be awaited)
    readFile(name)             Read a file from temp dir (async, must be awaited)

  Memory and CPU limits are enforced. Infinite loops will be interrupted.`;

// The `browser.*` handle plus the file-IO helpers, with signatures and examples.
export const SCRIPT_API = `Script API available inside every script:
  browser.getPage(nameOrId) Get a page by name (creates if new) or connect to an existing
                            tab by its targetId from listPages().
  browser.newPage()       Create an anonymous page. Anonymous pages are cleaned up after the script exits.
  browser.listPages()       List all tabs: named pages and existing browser tabs.
                            Returns [{id, url, title, name}].
  browser.closePage(name) Close and remove a named page.
  await saveScreenshot(buf: Buffer, name: string): Promise<string>
                          Save a screenshot buffer to ~/.canary/tmp/<name>.
                          Returns the full path to the saved file.
                          Example: const path = await saveScreenshot(await page.screenshot(), "home.png");

  await writeFile(name: string, data: string): Promise<string>
                          Write data to ~/.canary/tmp/<name>.
                          Returns the full path to the written file.
                          Example: const path = await writeFile("results.json", JSON.stringify(data));

  await readFile(name: string): Promise<string>
                          Read a file from ~/.canary/tmp/<name>.
                          Returns the file content as a string.
                          Example: const data = JSON.parse(await readFile("results.json"));

  console.log/info(...)   Write output to stdout.
  console.warn/error(...) Write output to stderr.

  All file I/O functions are async and must be awaited.
  All paths are restricted to ~/.canary/tmp/ — no filesystem escape.`;

// Pages are full Playwright Page objects — pointer to the upstream API docs.
export const PLAYWRIGHT_PAGE_NOTE = `Pages returned by \`browser.getPage()\` and \`browser.newPage()\` are full Playwright
Page objects — you get the same API (goto, click, fill, locator, evaluate, etc.):
  https://playwright.dev/docs/api/class-page`;

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

const indent = (text: string, prefix: string): string =>
  text
    .split("\n")
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join("\n");

// Script bodies shared by every CLI's examples — pure sandbox JavaScript.
const INSPECT_TABS_BODY = `const tabs = await browser.listPages();
console.log(JSON.stringify(tabs, null, 2));`;

const INSPECT_PAGE_BODY = `const page = await browser.getPage("TARGET_ID_HERE");
console.log(JSON.stringify({
  url: page.url(),
  title: await page.title(),
}, null, 2));`;

const SNAPSHOT_BODY = `const page = await browser.getPage("main");
const result = await page.snapshotForAI();
console.log(result.full);
// Returns { full: string, incremental?: string }.
// Optional args: { track?: string, depth?: number, timeout?: number }.
// Read result.full to identify the right element.
// Then interact with it using Playwright:
// await page.getByRole("button", { name: "Continue" }).click();
// Re-run page.snapshotForAI({ track: "main" }) after the page changes.`;

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
      example(INSPECT_TABS_BODY, { step: "inspect", connect: true }),
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
    indent(example(SNAPSHOT_BODY, { step: "discover" }), "    "),
  ].join("\n");

  const choosingApproach = [
    "  Choosing your approach:",
    "    Unknown pages: use page.snapshotForAI() first to discover the page, then interact based on what you find.",
    "    Known pages/selectors: skip the snapshot and use direct Playwright selectors like page.click(), page.fill(), or page.locator() for faster, more reliable automation.",
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
    "    For local dev servers (Next.js, Vite, etc.), prefer:",
    '      await page.goto(url, { waitUntil: "domcontentloaded" });',
    '    The default "load" wait can hang on HMR, streaming, or other long-lived dev-server connections.',
    '    Use "load" only when you specifically need every subresource to finish loading.',
  ].join("\n");

  const errorRecovery = [
    "  Error recovery:",
    "    If a script fails, the page usually stays where it stopped.",
    "    Reconnect to the same page name, take a screenshot, and log the URL/title:",
    indent(example(ERROR_RECOVERY_BODY, { step: "recover" }), "    "),
  ].join("\n");

  const playwrightMethods = `  Common Playwright Page methods:
    page.goto(url, { waitUntil: "domcontentloaded" })
                                           Navigate to a URL; prefer this on dev servers
    page.title()                           Get the current page title
    page.url()                             Get the current URL
    page.snapshotForAI(options)            Get an AI-optimized snapshot; returns { full, incremental? }
                                           Options: { track?: string, depth?: number, timeout?: number }
    page.getByRole(role, { name })         Target elements discovered from the snapshot
    page.textContent(selector)             Get the text content of an element
    page.innerHTML(selector)               Get the inner HTML of an element
    page.fill(selector, value)             Fill an input field
    page.click(selector)                   Click an element
    page.type(selector, text)              Type text character by character
    page.press(selector, key)              Press a key such as Enter or Tab
    page.waitForSelector(selector)         Wait for an element to appear
    page.waitForURL(url)                   Wait for navigation to a URL
    page.screenshot()                      Capture a screenshot buffer; save it with saveScreenshot(...)
    page.$$eval(selector, fn)              Run a function on all matching elements
    page.$eval(selector, fn)               Run a function on the first matching element
    page.evaluate(fn)                      Run JavaScript in the page context (plain JS only)
    page.locator(selector)                 Create a locator for chained actions`;

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
