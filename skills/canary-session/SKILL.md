---
name: canary-session
description: Record a verifiable QA session with Canary — explore a flow step by step against one persistent browser, each script a recorded step that captures a Playwright trace, video, network HAR, and console, then render a self-contained report.html. Use when the user wants to verify or QA a flow, produce evidence or a report, or capture a trace/video of a browser run. Trigger phrases — "record a session", "QA this flow", "verify the checkout", "capture a trace", "give me a report of this run".
license: MIT
metadata:
  author: usecanary
  version: 0.4.2
  category: workflow
  tags:
    - canary
    - qa
    - testing
    - report
---

# Canary session (recorded QA)

Work the flow like a tester — observe, act, adapt — not as a pre-written script. Every script runs
as a **step** against one persistent browser; Canary records trace / video / HAR / console and
renders a self-contained `report.html`. Use the **canary-scripting** skill for the API.

## When to use

- Verifying or QA-ing a user flow and producing shareable evidence.
- Capturing a Playwright trace, video, or network HAR of a run.
- Any run where "what happened?" needs a report (for a quick one-off, use **canary-automate**).

## Examples

### Example 1: verify a flow
User says: "QA the checkout flow and give me a report" or "verify login works"
Start a session, explore-and-record the flow step by step, end it, point to `report.html`.

### Example 2: capture a trace
User says: "record a trace of the signup" or "I need a video of this bug"
One session, small steps that reproduce it, `session end` — the report bundles trace, video, HAR, console.

## Workflow (the explore-and-record loop)

1. Ensure the runtime: `npx @usecanary/cli install` (one-time).
2. Start: `id=$(npx @usecanary/cli session start --name "<flow>")`
3. **LOOK** — observe before acting; an observe step records like any other:
   ```sh
   npx @usecanary/cli run --session "$id" --step observe-home <<'EOF'
   const page = await browser.getPage("main");
   await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
   console.log(page.url(), await page.title());
   console.log((await page.snapshotForAI()).full); // aria outline — pick selectors from this
   EOF
   ```
4. **DECIDE** the next small action from stdout.
5. **ACT** — run that one action (or a tight cluster, e.g. fill three fields + submit) as its own
   intent-named step: `npx @usecanary/cli run --session "$id" --step submit-login-form <<'EOF' …`
   (a `./step.js` file works too). Reuse the same named page so each step picks up where the last
   left off.
6. **READ** stdout + exit code. Failed? Observe where the page is, then retry as a NEW step —
   duplicates are honest evidence, and a failed step does not end the session.
7. Repeat 3–6 until the flow is done; finish with explicit assertion step(s): expected text / URL /
   state, logging `PASS`/`FAIL`.
8. End + render: `npx @usecanary/cli session end "$id"` → `~/.canary/sessions/<id>/report.html`
9. Offer **canary-review** (or `npx @usecanary/ui`) to browse it.
10. Done? Leave the daemon running for the next session, or `npx @usecanary/cli stop` to shut it
    (and every browser) down — or pass `--stop-daemon` to step 8 (`session end --stop-daemon`).

## Explore vs batch

- Unknown UI → small steps, observe between actions, selectors picked from snapshots.
- Known flow (user gave exact steps, or you already verified the UI) → skip the observing and
  batch the flow into a few named steps. Re-checking what you already know just pads the report.

## Hard rules

<!-- canary:snippet rule-observe-first -->
- Unknown page? Snapshot first, then act: read `(await page.snapshotForAI()).full` to see what
  is there, pick a semantic selector from it (`getByRole`, `getByText`), then interact. Never
  guess selectors blind.
- Known page or selectors? Skip the snapshot and use direct selectors — faster and more reliable.
<!-- canary:end rule-observe-first -->

<!-- canary:snippet rule-screenshot cli=npx-cli -->
After each `npx @usecanary/cli run --step`, the daemon auto-captures ONE screenshot of the step's
last-opened tab and binds it to that step in the report. So:

- Keep one primary named page per step — the report screenshot is always the page you mean.
- If a step opens several tabs, open the one you want featured last.
- `saveScreenshot(...)` images land in `~/.canary/tmp/` and are NOT in the report — they're
  extras for debugging.
<!-- canary:end rule-screenshot -->

<!-- canary:snippet rule-fail-fast cli=npx-cli -->
- End each script by logging the state you need for the next decision — stdout is your
  observation channel.
- Use short timeouts (`npx @usecanary/cli run --timeout 10`) so a step fails fast instead of hanging on a
  missing element.
- In assertion / extraction steps, degrade gracefully — log a `WARN` / `FAIL` line instead of
  crashing, so the step still records its evidence. While exploring, a missed selector means
  look again (snapshot, fix, retry as a new step), not a silent fallback.
- End before you stop: `npx @usecanary/cli stop` shuts the daemon down and aborts any live session,
  skipping its report.html — always `npx @usecanary/cli session end <id>` first.
<!-- canary:end rule-fail-fast -->

- **Name every step by intent** (`observe-cart`, `submit-login-form`), not mechanics (`step-3`) —
  the report timeline should read as a QA narrative.
- Don't invent API shapes; use the canary-scripting reference.
- Use `session abort <id>` only to salvage a broken run.
