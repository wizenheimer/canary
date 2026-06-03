# create-canary

> The guided setup wizard for [Canary](https://github.com/usecanary/canary) — an AI-agent QA toolkit
> that drives real browsers, records QA sessions (Playwright trace, video, network HAR, console), and
> renders self-contained verification reports.

[![npm](https://img.shields.io/npm/v/create-canary.svg)](https://www.npmjs.com/package/create-canary)
[![license](https://img.shields.io/npm/l/create-canary.svg)](https://github.com/usecanary/canary)

One command to get Canary, its browser runtime, and the agent integration set up — no flags to
remember. Every step just shells out to the same published commands you could run by hand, so there's
no magic and nothing bespoke to uninstall.

## Use

```bash
npm create canary
# or:  npm init canary  ·  pnpm create canary  ·  yarn create canary
```

You'll get a checklist (space toggles, enter confirms). Recommended items are pre-selected:

| Step | Default | What it runs |
| --- | --- | --- |
| Install the `canary` command globally | ✓ | `npm i -g @usecanary/cli` |
| Install the browser runtime (Chromium) | ✓ | `canary install` |
| Install the agent skills (any tool) | ✓ | `npx skills add usecanary/canary` |
| Install the Claude Code plugin (slash commands) | ✓ | `claude plugin marketplace add …` + `plugin install …` |
| Also install `canary-browser` globally | — | `npm i -g @usecanary/browser` |
| Also install the `canary-viewer` viewer globally | — | `npm i -g @usecanary/ui` |

Installing the CLIs globally puts `canary`, `canary-browser`, and `canary-viewer` on your `PATH` so
day-to-day use drops the `npx` prefix. If the Claude Code CLI isn't found, the wizard prints the
in-app `/plugin …` commands to run instead.

### Non-interactive

In a pipe or CI (no TTY), the wizard prints the exact commands to run instead of prompting — safe to
inspect before executing.

## After setup

```bash
canary session start --name "checkout"   # start a recorded session (prints an id)
canary run ./step.js --session <id> --step "open"
canary session end <id>                  # -> ~/.canary/sessions/<id>/report.html
canary-viewer                            # browse recorded sessions
```

Using a coding agent? Try `/canary:verify` (plan QA for your changes) or `/canary:session` (record a
flow) in Claude Code / Cursor / Codex. See `examples/` in the repo for runnable demos.

## Related packages

- [`@usecanary/cli`](https://www.npmjs.com/package/@usecanary/cli) — the `canary` session orchestrator.
- [`@usecanary/browser`](https://www.npmjs.com/package/@usecanary/browser) — one-off automation engine.
- [`@usecanary/ui`](https://www.npmjs.com/package/@usecanary/ui) — the `canary-viewer` session browser.

MIT · [source](https://github.com/usecanary/canary)
