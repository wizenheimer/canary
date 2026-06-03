---
name: canary-run
description: Automate a one-off browser task with Canary — navigate, click, scrape, screenshot — and return the result.
argument-hint: "<what to automate>"
---

Delegate to the `automate-agent` subagent. Give it the task: **$ARGUMENTS**.

Ask it to write a Canary script (using the `canary-scripting` API), run it with
`npx @usecanary/browser run`, and report the result. For a *recorded* run with a report instead of a
one-off, use `/canary:session`.
