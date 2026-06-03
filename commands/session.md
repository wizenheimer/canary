---
description: Record a verifiable QA session (trace, video, HAR, console) and render a report.
argument-hint: "<flow to verify>"
---

Delegate to the `session-agent` subagent. Give it the flow: **$ARGUMENTS**.

Ask it to break the flow into steps, run each as a `canary run --session` step, `session end` to
render the report, and report the `report.html` path with a one-line pass/fail summary. Offer
`/canary:review` to open it.
