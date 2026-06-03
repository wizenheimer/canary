// Help prose for the `canary` orchestrator, shown via commander's
// `.addHelpText()` / `.description()`. Mirrors the canary-browser engine's
// rich `--help` (a long-about + an after-help usage guide + per-command detail).

// Shown at the top of `canary --help`.
export const CLI_LONG_ABOUT = `Canary records capture-enabled QA sessions. It drives a real browser with
scripts run as ordered steps, captures a Playwright trace, video, network HAR,
and console for each run, and renders a self-contained report.html you can open
or browse in a local web UI. A background daemon (Playwright + a QuickJS sandbox)
starts automatically when needed.

THE SESSION LIFECYCLE:
  1. start   canary session start --name "checkout"        -> prints a session id
  2. run     canary run step.js --session <id> --step open    (one script per step)
  3. end     canary session end <id>                        -> writes report.html
  4. view    canary ui                                      -> browse every session

WHAT IS CAPTURED (per session; toggle on \`session start\`):
  trace        Playwright trace — DOM snapshots + actions, one group per step
  video        WebM recording of the run
  har          network request/response log
  console      console output + page errors
  screenshots  one per step, auto-captured from the step's last-opened page

Artifacts live under ~/.canary/sessions/<id>/ (session.json, results.json, report.html, trace.zip, …).
Scripts use the same sandboxed API as the engine — see \`canary-browser --help\` for the full reference.`;

// Shown after the options in `canary --help`.
export const USAGE_GUIDE = `SESSION WORKFLOW GUIDE:
  Structure a session as a sequence of small steps — one script per step (open, act, assert).
  Each \`canary run --step <name>\` is one step in the report, with its own trace group and ONE
  auto-captured screenshot (taken from the LAST page opened during that step). So:
    - Use ONE primary named page per step.
    - Reuse the same page name across steps to "click through" like a user — named pages persist
      across steps within a session.
    - If a step opens extra tabs, open the one you want featured in the report LAST.

  Passing data between steps:
    - Browser state (named pages, cookies) persists across steps automatically.
    - For values: writeFile("state.json", JSON.stringify(x)) in one step, readFile it in the next.

  Reading results:
    canary session list                       List sessions (table; --json for machine output)
    canary status --session <id>              One session's status
    open ~/.canary/sessions/<id>/report.html  The self-contained report
    canary ui                                 Browse, search, and organize all sessions

  Tips:
    - \`--json\` (global) emits machine-readable JSON on stdout; \`-v\`/\`--verbose\` raises stderr logging.
    - \`canary run --timeout 30\` fails a step fast instead of hanging on a missing element.
    - \`canary session end --stop-daemon\` shuts the daemon down if nothing else is using it.
    - \`canary stop\` shuts the whole background daemon down (and every browser it's running).
    - Need a quick one-off with NO recording? Use \`canary-browser run\` instead of a session.`;

// Per-command long help (shown before that command's own --help body).
export const SESSION_START_LONG_ABOUT = `Start a capture-enabled session and print its id.

Capture is on by default — disable per stream with --no-trace / --no-video / --no-har / --no-console.
Use --headless for unattended runs; omit it to watch the browser window.

  id=$(canary session start --name "checkout")
  id=$(canary session start --name "smoke" --headless --no-video)`;

export const RUN_LONG_ABOUT = `Run a script as one step inside a session.

The script (a FILE, or stdin if omitted) executes in the sandbox the same way \`canary-browser run\`
does — top-level await, with \`browser\` and \`console\`. The step's name labels it in the report and
owns one auto-captured screenshot (from the last page opened during the step).

  canary run open.js --session "$id" --step open
  echo 'const p = await browser.getPage("home"); await p.goto("https://example.com");' \\
    | canary run --session "$id" --step home --timeout 30`;

export const SESSION_END_LONG_ABOUT = `Stop recording, collect artifacts, and render the report.

Writes ~/.canary/sessions/<id>/report.html (self-contained) plus results.json. Pass --stop-daemon to
shut the daemon down afterward if no other sessions or browsers remain.

  canary session end "$id"`;

export const STOP_LONG_ABOUT = `Stop the background daemon and everything it is running (all browsers and sessions).

This is the same graceful shutdown as \`canary daemon stop\`. Any still-active session is
aborted — its artifacts are flushed, but its report.html is NOT regenerated. For a clean
report, run \`canary session end <id>\` first, then \`canary stop\`.

  canary stop`;

export const UI_LONG_ABOUT = `Launch the local web UI to browse, organize, and search recorded sessions.

Spins up a local server (like \`npx playwright show-trace\`) and opens your browser. Reads
~/.canary/sessions by default; point it elsewhere with --dir. Ctrl-C stops it.

  canary ui
  canary ui --dir ./artifacts --no-open`;

export const INSTALL_LONG_ABOUT = `Install the embedded daemon runtime: Chromium plus the Playwright + QuickJS
sandbox, into ~/.canary. Run once before your first session (downloads ~150 MB).`;

export const INIT_LONG_ABOUT = `One-shot setup: install the browser runtime, then print next steps (add the
agent plugin, install skills, open the viewer). The friendlier Ink version is \`npm create canary\`.`;
