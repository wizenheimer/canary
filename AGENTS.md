# Agent Orientation

This file is the entry point for AI agents (and humans new to the repo).

## What canary is

Canary is an AI-agent QA toolkit for driving real browsers. Today the repo ships two apps:

1. **`canary-browser` (engine CLI)** — the browser automation tool. Persistent named pages, sandboxed JavaScript, headless or headed. Embeds and supervises the daemon.
2. **`canary-daemon`** — a long-running Node process owning Playwright + a QuickJS sandbox. Embedded into `canary-browser` at build time. Speaks line-delimited JSON over a named pipe / Unix socket.

When you run `canary-browser run --script=…`, the path is:

```
canary-browser run --browser=… --script=…  →  daemon RPC  →  Playwright
```

## Two apps + three packages

| Workspace             | Role                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `apps/canary-browser` | Browser automation CLI — owns the daemon lifecycle, ships the embedded daemon bundle         |
| `apps/canary-daemon`  | Internal Playwright host + QuickJS sandbox. Built standalone, embedded into `canary-browser` |
| `packages/protocol`   | Zod IPC schemas. Single source of truth — daemon validates, CLI infers types                 |
| `packages/config`     | Shared tsconfig bases (`base`, `node-app`)                                                    |
| `packages/logger`     | Shared pino-backed structured logger (source-distributed)                                    |

## Build flow

`turbo run build` topo-sorts via `^build`:

1. `@canary/protocol` + `@canary/config` + `@canary/logger` (no build, source-distributed)
2. `@canary/daemon` builds → emits `dist/daemon.bundle.mjs` + `dist/sandbox-client.js`
3. `@canary/browser` prebuild reads `apps/canary-daemon/dist/*` and writes `src/assets/embedded.generated.ts`, then builds

## Code style & logging

- **Linting/formatting:** [Ultracite](https://docs.ultracite.ai/) over Biome — config in `biome.jsonc` (extends `ultracite/biome/core`). `pnpm lint` checks; `pnpm format` autofixes; the pre-commit hook runs `ultracite fix` on staged files. Don't reintroduce ESLint/Prettier.
- **Logging:** use `@canary/logger` (`createLogger`, pino-backed, structured) for diagnostics — never `console.*` in app code (Biome's `noConsole` is an error). Reserve `process.stdout` for machine-readable CLI output. Level via `CANARY_LOG_LEVEL` (trace|debug|info|warn|error|silent); the daemon logs to `~/.dev-browser/daemon.log`, the CLI to stderr (raise with `--verbose`).
- The vendored Playwright fork at `apps/canary-daemon/src/sandbox/forked-client/` is excluded from lint/format — keep it diffable against upstream.

## Validation

Before committing:

```bash
pnpm install
pnpm check     # ultracite lint + turbo compile + test
```

Per-workspace:

```bash
pnpm --filter @canary/daemon test
pnpm --filter @canary/browser test
```

## Provenance

Canary is forked from the TypeScript portion of [`dev-browser`](https://github.com/SawyerHood/dev-browser) (MIT, Sawyer Hood). The Rust and Go CLI implementations were dropped during migration; the daemon and the TS CLI are the basis for `canary-daemon` and `canary-browser`.
