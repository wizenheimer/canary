---
name: canary-session
description: Record a verifiable QA session with Canary — run scripts as steps that capture a Playwright trace, video, network HAR, and console, then render a self-contained report.html. Use when the user wants to verify or QA a flow, produce evidence or a report, or capture a trace/video of a browser run. Trigger phrases — "record a session", "QA this flow", "verify the checkout", "capture a trace", "give me a report of this run".
license: MIT
metadata:
  author: usecanary
  version: 0.1.0
  category: workflow
  tags:
    - canary
    - qa
    - testing
    - report
---

# Canary session (recorded QA)

Run scripts as **steps** inside a capture-enabled session; Canary records trace / video / HAR /
console and renders a self-contained `report.html`. Use the **canary-scripting** skill for the API.

## When to use

- Verifying or QA-ing a user flow and producing shareable evidence.
- Capturing a Playwright trace, video, or network HAR of a run.
- Any run where "what happened?" needs a report (for a quick one-off, use **canary-automate**).

## Examples

### Example 1: verify a flow
User says: "QA the checkout flow and give me a report" or "verify login works"
Start a session, run one script per phase (open → act → assert), end it, point to `report.html`.

### Example 2: capture a trace
User says: "record a trace of the signup" or "I need a video of this bug"
One session, a step per phase, `session end` — the report bundles the trace, video, HAR, console.

## Workflow

1. Ensure the runtime: `npx @usecanary/cli install` (one-time).
2. Start: `id=$(npx @usecanary/cli session start --name "<flow>")`
3. Run each phase as its own step:
   `npx @usecanary/cli run ./step.js --session "$id" --step "<name>"`
4. End + render: `npx @usecanary/cli session end "$id"` → `~/.canary/sessions/<id>/report.html`
5. Offer **canary-review** (or `npx @usecanary/ui`) to browse it.

## Hard rules

- **One primary named page per step** — keeps each step's report screenshot correct (see canary-scripting).
- Don't invent API shapes; use the canary-scripting reference.
- Degrade, don't crash: log a `WARN` on a missing selector so the step still records its evidence.
