// CLI_LONG_ABOUT prose shown in `--help`.
export const CLI_LONG_ABOUT = `Dev Browser is a CLI for controlling local or external browsers with JavaScript scripts.
Scripts run in a sandboxed QuickJS runtime (not Node.js). Top-level \`await\` is
available, along with a preconnected \`browser\` global and standard \`console\` output.
A background daemon starts automatically when needed and manages browser instances,
named pages, and CDP connections.

SANDBOX ENVIRONMENT:
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

  Memory and CPU limits are enforced. Infinite loops will be interrupted.

Primary invocation styles:
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
  EOF

Script API available inside every script:
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
  All paths are restricted to ~/.canary/tmp/ — no filesystem escape.

Pages returned by \`browser.getPage()\` and \`browser.newPage()\` are full Playwright
Page objects — you get the same API (goto, click, fill, locator, evaluate, etc.):
  https://playwright.dev/docs/api/class-page`;

// llm-guide.txt is generated into src/assets/embedded.generated.ts at
// prebuild time (see scripts/check-daemon-bundles.mjs). Same source in
// tsx, vitest, and esbuild.
import { LLM_GUIDE } from "../assets/embedded.generated.js";

export const CLI_AFTER_LONG_HELP: string = LLM_GUIDE;

export const RUN_LONG_ABOUT =
  "Run a script file against the browser.\n\n" +
  "The file is executed the same way as stdin input: as top-level JavaScript with `await`, `browser`, and `console` available.\n\n" +
  "Use top-level flags before `run`, for example `canary-browser --browser my-project run script.js`.";

export const INSTALL_LONG_ABOUT =
  "Install Playwright browsers (Chromium).\n\n" +
  "Downloads the Chromium build used for daemon-managed browser instances.";

export const INSTALL_SKILL_LONG_ABOUT =
  "Install the embedded canary skill into agent skill directories.\n\n" +
  "By default, launches an interactive multi-select prompt for the supported install targets when a TTY is available.\n\n" +
  "In non-interactive environments, installs to both supported skill directories.\n\n" +
  "Use `--claude` and/or `--agents` to skip prompting and install to specific targets.";

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
export const INSTALL_SKILL_SHORT =
  "Install the canary skill into agent skill directories";
export const BROWSERS_SHORT = "List all managed browser instances";
export const STATUS_SHORT = "Show daemon status";
export const STOP_SHORT = "Stop the daemon and all browsers";

export const ROOT_SHORT = "Control browsers with JavaScript automation scripts";
