---
description: Record a verifiable QA session (trace, video, HAR, console) and render a report.
argument-hint: "<flow to verify>"
---

Delegate to the `session-agent` subagent. Give it the flow: **$ARGUMENTS**.

Ask it to explore the flow step by step — observe the live page, run each small action as an
intent-named `canary run --session` step, finish with assertion step(s) — then `session end` to
render the report, and report the `report.html` path with a one-line pass/fail summary. Offer
`/canary:review` to open it.
