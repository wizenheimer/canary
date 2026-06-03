# @usecanary/cli

`canary` — the session orchestrator for [canary](https://github.com/usecanary/canary). Drive a
real browser, record QA sessions (Playwright trace, video, network HAR, console), and render a
self-contained `report.html`.

## Install

```bash
npm i -g @usecanary/cli && canary install   # adds `canary`, then downloads Chromium + the runtime into ~/.canary
# one-off, no install: npx @usecanary/cli install
```

## Use

```bash
canary init                              # one-shot setup (runtime + agent skill)
id=$(canary session start --name "checkout")
canary run ./step.js --session "$id" --step "open"
canary session end "$id"                 # -> ~/.canary/sessions/<id>/report.html
canary-viewer                            # browse recorded sessions (npm i -g @usecanary/ui)
canary skills                            # install the canary agent skill (~/.claude/skills)
```

Run `canary --help` for the full command list.

## Scripts

Plain async JS in a sandbox with a Playwright-like API: `browser.getPage(name)`, `page.goto`,
`page.locator`, `page.evaluate`, `saveScreenshot(buffer, name)`, `console.log`.

MIT · [source](https://github.com/usecanary/canary)
