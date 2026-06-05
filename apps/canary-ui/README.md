# @usecanary/ui

> `canary-viewer` — the local **session viewer** for [Canary](https://github.com/wizenheimer/canary).
> Browse, search, organize, and replay recorded QA sessions (trace, video, network HAR, console,
> per-step screenshots) in your browser. Self-contained — no daemon, no setup.

[![npm](https://img.shields.io/npm/v/@usecanary/ui.svg)](https://www.npmjs.com/package/@usecanary/ui)
[![license](https://img.shields.io/npm/l/@usecanary/ui.svg)](https://github.com/wizenheimer/canary)

Like `npx playwright show-trace`, but for whole Canary sessions: it spins up a local server, opens
your browser, and reads the artifacts that [`@usecanary/cli`](https://www.npmjs.com/package/@usecanary/cli)
wrote to `~/.canary/sessions`.

## Use

```bash
npm i -g @usecanary/ui            # adds the `canary-viewer` command
canary-viewer                     # browse ~/.canary/sessions, opens your browser

canary-viewer --dir ./artifacts   # point at a non-default sessions folder
```

No global install? `npx @usecanary/ui`. Stop it with `Ctrl-C`.

The Canary CLI also launches it for you — `canary ui` is the same viewer.

## Options

| Flag | Effect |
| --- | --- |
| `--dir <path>` | Sessions folder to serve (default: `~/.canary/sessions`). |
| `--port <port>` | Port to listen on (default: an open port). |
| `--host <host>` | Host/interface to bind. |
| `--no-open` | Start the server but don't open a browser (prints the URL). |

## What you can see

Each session opens to a report with everything captured during the run:

- **Steps** — every `canary run --step` as an ordered entry, pass/fail, with its screenshot.
- **Trace** — the Playwright trace: DOM snapshots and actions, grouped per step.
- **Video** — a WebM recording of the run.
- **Network** — the HAR: every request/response, status, and timing.
- **Console** — console output and page errors.
- **Summary** — steps passed/failed, console errors, network failures, duration.

Search and organize across every recorded session from the index.

## Related packages

- [`@usecanary/cli`](https://www.npmjs.com/package/@usecanary/cli) — record the sessions this viewer
  displays.
- [`@usecanary/browser`](https://www.npmjs.com/package/@usecanary/browser) — one-off automation engine.
- [`create-canary`](https://www.npmjs.com/package/create-canary) — `npm create canary` guided setup.

MIT · [source](https://github.com/wizenheimer/canary)
