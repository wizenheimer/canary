# @usecanary/ui

The canary **session viewer** — a local web UI to browse, search, organize, and replay recorded
[canary](https://github.com/usecanary/canary) sessions (trace, video, network HAR, console,
per-step screenshots).

## Use

```bash
npm i -g @usecanary/ui            # adds the `canary-viewer` command
canary-viewer                     # browse ~/.canary/sessions
canary-viewer --dir ./artifacts
# one-off, no install: npx @usecanary/ui
```

Like `npx playwright show-trace`, but for canary sessions: it spins up a local server and opens your
browser. Self-contained — no daemon, no setup.

MIT · [source](https://github.com/usecanary/canary)
