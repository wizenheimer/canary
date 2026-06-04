---
name: canary-verify
description: Turn a code change into a prioritized browser-QA plan with Canary — read the git diff, infer which user-facing workflows it touches, suggest the concrete flows and the checks that must hold, then optionally record those flows as a session with a report.html. Use when the user has changed code and asks what to test, wants to QA a diff, branch, or PR, or wants a focused regression plan before merging. Trigger phrases — "what should I test for this change", "QA my diff", "verify this PR", "I changed X, what flows might break", "regression plan for this branch", "what should I QA before merging".
license: MIT
metadata:
  author: usecanary
  version: 0.1.0
  category: workflow
  tags:
    - canary
    - qa
    - testing
    - regression
    - planning
---

# Canary verify (change → QA plan)

Read a code change, infer the **user-facing workflows** it affects, and suggest a **prioritized QA
plan** — the concrete Canary flows that verify them. Then optionally hand off to **canary-session** to
record those flows and produce `report.html`. Use the **canary-scripting** skill for the step API.

## When to use

- The user changed code and asks **what to test** or what might regress.
- QA-ing a **diff, branch, or PR** before merging.
- Building a focused **regression plan** scoped to the change — not a full re-test.
- Only need the suggestion? Stop at the plan. Need evidence? Hand off to **canary-session**. Driving a
  browser once with no plan? Use **canary-automate**.

## Examples

### Example 1: verify the working tree
User says: "what should I QA for these changes?" or "verify my diff"
Read the working-tree diff, map changed files to affected routes/flows, and present a ranked plan
(P0/P1/P2). Offer to record the P0 flows as a session.

### Example 2: verify a branch or PR before merge
User says: "regression plan for feature/checkout" or "QA this PR"
Diff the branch against its base, group the touched workflows, suggest the steps per flow, and hand
the approved flows to **canary-session** for a report.

## Workflow

1. **Get the diff.** Working tree: `git diff` and `git diff --staged`. A branch/PR:
   `git diff <base>...HEAD` (list files with `git diff --name-status <base>...HEAD`). Or reason
   straight from a prose description ("I changed the login redirect") — skip git.
2. **Infer affected workflows.** For each changed file, decide whether it touches a user-facing
   route/page/flow, and group by **workflow** (sign-up, checkout, …), not by file. File→workflow
   heuristics are in [`references/REFERENCE.md`](references/REFERENCE.md).
3. **Suggest a prioritized plan.** For each workflow: a one-line intent, a **P0/P1/P2** priority, the
   entry URL, the **checks that must hold** (visible text / URL / state / no console error), the likely
   phases as a guide — not a pre-written script — and which changed files put it at risk. Use the plan
   template in [`references/REFERENCE.md`](references/REFERENCE.md).
4. **Confirm, then hand off.** Present the plan and ask which flows to record. For approved flows,
   follow **canary-session**'s explore-and-record loop (one session per flow: observe the live page,
   small intent-named steps, assertion steps for the checks) → `report.html`; offer **canary-review**
   to open it. Don't record flows the user didn't approve.

## Hard rules

- **Suggest first, record second** — the default output is the plan; only record after the user confirms.
- Map to **user-facing workflows**, not files. Call out non-UI changes (pure refactors, types,
  config/build, docs) as **no browser QA needed** rather than inventing a flow.
- **Read-only on the repo** — inspect the diff and code; never stage, commit, or modify source.
- Recording reuses **canary-session** — don't reinvent `session start` / `run` / `session end` here.
- No diff (or all non-UI)? Say so plainly and stop — don't fabricate a plan.
