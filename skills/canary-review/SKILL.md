---
name: canary-review
description: Open and triage recorded Canary sessions in the local viewer. Use when the user wants to look at, replay, compare, or triage a recorded session — or asks what happened in a run, to open the report, or to see the trace/video/screenshots. Trigger phrases — "open the canary viewer", "show me the last session", "what failed in that run", "review the recording", "open the report".
license: MIT
metadata:
  author: usecanary
  version: 0.4.0
  category: workflow
  tags:
    - canary
    - viewer
    - triage
---

# Canary review (triage)

Open recorded sessions in the local viewer and summarize what happened. Sessions live in
`~/.canary/sessions/<id>/` — each has `results.json`, `report.html`, and trace / video / HAR /
console / screenshots.

## When to use

- Browsing or replaying recorded sessions.
- Triaging a run: which steps passed/failed, console errors, network failures.
- Opening the report or the trace for a specific session.

## Examples

### Example 1: open the viewer
User says: "open the canary viewer" or "let me see my sessions"
Run `npx @usecanary/ui` (a local server, like `npx playwright show-trace`) in the background and give the URL. Pass `--dir <path>` for a non-default folder.

### Example 2: triage the last run
User says: "what failed in the last session?" or "summarize the latest run"
Read the newest `~/.canary/sessions/*/results.json`, summarize steps (pass/fail, durations, console/network issues) with the `report.html` path, then open the viewer.

## Workflow

1. **Browse:** `npx @usecanary/ui` (`--dir <path>` for a non-default sessions folder). List sessions
   without the UI via `npx @usecanary/cli session list`; check what's running with
   `npx @usecanary/cli status [--session <id>]`.
2. **Summarize:** read the session's `results.json` (steps, summary, artifacts) and report pass/fail
   with counts; cite the `report.html` path.
3. Review is **read-only** — don't modify session files.
