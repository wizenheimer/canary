---
description: Turn a code change into a prioritized browser-QA plan with Canary, then optionally record the flows.
argument-hint: "[ref range | description — blank = working-tree diff]"
---

Delegate to the `verify-agent` subagent. Scope: **$ARGUMENTS**.

If `$ARGUMENTS` is blank, verify the working-tree diff (`git diff` + `git diff --staged`). If it names
a ref or range (e.g. `main...HEAD`, a branch, a PR), diff that. If it's a prose description of a
change, reason from that. Ask it to read the diff, infer the affected user-facing workflows, and
present a **prioritized QA plan** (P0/P1/P2 flows with the checks that must hold, phases as a guide).
Then ask which flows
to record — for approved ones, record a Canary session (`/canary:session` mechanics) and report each
`report.html` with a one-line pass/fail. Offer `/canary:review` to open it. Already know the flow? Use
`/canary:session`. Just a quick one-off with no plan? Use `/canary:run`.
