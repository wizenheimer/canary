# Agent Orientation

This file is the entry point for AI agents (and humans new to the repo).

## What canary is

Canary is an AI-agent QA toolkit for driving real browsers. The pieces:

1. **`canary` (orchestrator CLI, `@usecanary/cli`)** — records capture-enabled QA sessions (trace/video/HAR/console) as a series of script steps and renders a self-contained report. The primary, user-facing CLI.
2. **`canary-browser` (engine CLI, `@usecanary/browser`)** — one-off browser automation: persistent named pages, sandboxed JavaScript, headless or headed. Embeds and supervises the daemon.
3. **`canary-daemon`** — a long-running Node process owning Playwright + a QuickJS sandbox. Embedded into the CLIs at build time. Speaks line-delimited JSON over a named pipe / Unix socket.
4. **`canary-ui` (`@usecanary/ui`)** — the local session viewer; ships standalone. Run it with `canary-viewer` (after `npm i -g @usecanary/ui`), or `canary ui` from a repo checkout, or one-off via `npx @usecanary/ui`.

Both CLIs reach the browser the same way:

```
canary run … --session …   /   canary-browser run …   →   daemon RPC   →   Playwright
```

## Apps + packages

| Workspace                | Role                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `apps/canary`            | Session orchestrator CLI (`canary`) — records QA sessions, renders reports. The primary CLI.    |
| `apps/canary-browser`    | Browser-automation engine CLI (`canary-browser`) — owns the daemon lifecycle, embeds the daemon |
| `apps/canary-daemon`     | Internal Playwright host + QuickJS sandbox. Built standalone, embedded into the CLIs            |
| `apps/canary-ui`         | Local web viewer (Astro + React islands). Reads `results.json`; run via `canary ui` or `npx @usecanary/ui` |
| `apps/create-canary`     | `npm create canary` setup wizard (Ink)                                                          |
| `packages/protocol`      | Zod IPC schemas. Single source of truth — daemon validates, CLIs infer types                    |
| `packages/config`        | Shared tsconfig bases (`base`, `node-app`)                                                       |
| `packages/logger`        | Shared pino-backed structured logger (source-distributed)                                       |
| `packages/cli-kit`       | Shared CLI helpers (request ids, formatting, logger factory)                                    |
| `packages/daemon-client` | Daemon transport + lifecycle + paths; embeds the daemon bundle for the CLIs                     |

## Build flow

`turbo run build` topo-sorts via `^build`:

1. `@usecanary/protocol` + `@usecanary/config` + `@usecanary/logger` (no build, source-distributed)
2. `@usecanary/daemon` builds → emits `dist/daemon.bundle.mjs` + `dist/sandbox-client.js`
3. `@usecanary/browser` + `@usecanary/cli` embed their assets (the daemon bundle via `@usecanary/daemon-client`), then bundle with esbuild; `@usecanary/ui` builds an Astro node standalone — a self-contained `dist/server/entry.mjs` + `dist/client/` (`vite.ssr.noExternal` bundles every server dep, so the published package ships no runtime `node_modules`)

## Shared docs (skills + CLI help + README)

LLM-facing doc content that appears on more than one surface — the sandbox/scripting API and the
workflow rules — is single-sourced in `docs/snippets/` and stitched by `scripts/stitch-docs.mjs`:

- Edit the snippet, then run `make docs` (`--write`). CI fails on drift via `pnpm check` (`--check`).
- Never hand-edit `packages/cli-kit/src/snippets.generated.ts` or the content between
  `<!-- canary:snippet … -->` markers in `skills/`, `agents/`, or `README.md`.
- `skills/` is the skill pack consumed verbatim by Claude Code (`.claude-plugin/`), Cursor
  (`.cursor-plugin/`), Codex (`plugins/canary/`, whose `skills` is a symlink here), and
  `npx skills add` — keep SKILL.md frontmatter (`name`, `description`) intact and marker-free.

## Code style & logging

- **Linting/formatting:** [Ultracite](https://docs.ultracite.ai/) over Biome — config in `biome.jsonc` (extends `ultracite/biome/core`). `pnpm lint` checks; `pnpm format` autofixes; the pre-commit hook runs `ultracite fix` on staged files. Don't reintroduce ESLint/Prettier.
- **Logging:** use `@usecanary/logger` (`createLogger`, pino-backed, structured) for diagnostics — never `console.*` in app code (Biome's `noConsole` is an error). Reserve `process.stdout` for machine-readable CLI output. Level via `CANARY_LOG_LEVEL` (trace|debug|info|warn|error|silent); the daemon logs to `~/.canary/daemon.log`, the CLI to stderr (raise with `--verbose`).
- The vendored Playwright fork at `apps/canary-daemon/src/sandbox/forked-client/` is excluded from lint/format — keep it diffable against upstream.

## Validation

Before committing:

```bash
pnpm install
pnpm check     # ultracite lint + turbo compile + test
```

Per-workspace:

```bash
pnpm --filter @usecanary/daemon test
pnpm --filter @usecanary/browser test
```

## Viewing sessions

`canary ui` launches a local Astro web app (`apps/canary-ui`, `@usecanary/ui` — the Library and
SessionView screens are client-only React islands) that reads each
session's `results.json`, lists every recorded session, and renders it in the same tabbed,
"High-Contrast Precision" layout as the self-contained HTML report. You can organize sessions
into **virtual folders**, tag/note/search them, and delete-to-trash. It reads `~/.canary/sessions`
by default; `canary ui --dir <path>` (or adding roots in the UI) points it elsewhere.

- Organization lives in a per-root `.canary-ui.json` sidecar — **sessions stay flat on disk**;
  deletes move the dir to `<root>/.trash/` (restorable).
- The command resolves the built server (`dist/server/entry.mjs`) and spawns it in the foreground
  (Ctrl-C stops it); with no build present it falls back to `astro dev`. Build once for fast
  startup: `pnpm --filter @usecanary/ui build`. (The viewer stays a separate `node` server rather
  than folding into the esbuild/SEA CLI bundle — `CANARY_UI_SERVER` overrides its location. The
  server reads `HOST`/`PORT`/`CANARY_UI_ROOT` from the environment.)

## Provenance

Canary's daemon and TypeScript CLIs (`canary-daemon`, `canary-browser`, and the `canary` session orchestrator) are the core of the toolkit. Portions are derived from MIT-licensed upstream work by Sawyer Hood (see `LICENSE`).
