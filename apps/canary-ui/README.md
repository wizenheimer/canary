# @usecanary/ui

The canary **session viewer** — a local web UI to browse, search, organize, and replay recorded
[canary](https://github.com/usecanary/canary) sessions (trace, video, network HAR, console,
per-step screenshots).

## Use

```bash
npx @usecanary/ui                 # browse ~/.canary/sessions
npx @usecanary/ui --dir ./artifacts
```

Like `npx playwright show-trace`, but for canary sessions: it spins up a local server and opens your
browser. Self-contained — no daemon, no global install, no setup.

MIT · [source](https://github.com/usecanary/canary)
