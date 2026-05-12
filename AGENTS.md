# Agent Orientation

This file is the entry point for AI agents (and humans new to the repo).

## What canary is

Canary is an AI-agent QA toolkit. The end-to-end flow:

1. **`canary` (QA CLI)** — starts a session, runs your dev server, drives the browser, captures everything.
2. **`canary-browser` (engine CLI)** — the lower-level browser automation tool. Persistent named pages, sandboxed JavaScript, headless or headed.
3. **`canary-daemon`** — a long-running Node process owning Playwright + a QuickJS sandbox. Embedded into `canary-browser` at build time. Speaks line-delimited JSON over a named pipe / Unix socket.

When you run `canary exec "page.goto(...)"`, the path is:

```
canary CLI  →  canary-browser run --browser=… --script=…  →  daemon RPC  →  Playwright
```

## Three apps + four packages

| Workspace                    | Role                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/canary`                | QA workflow CLI — session lifecycle, recorder injection, viewer artifact assembly                    |
| `apps/canary-browser`        | Browser automation CLI — owns the daemon lifecycle, ships embedded daemon bundle                     |
| `apps/canary-daemon`         | Internal Playwright host + QuickJS sandbox. Built standalone, embedded into `canary-browser`         |
| `packages/protocol`          | Zod IPC schemas. Single source of truth — daemon validates, CLI infers types                         |
| `packages/viewer`            | React viewer, source-distributed (`"source"` export condition). `apps/canary` bundles it via esbuild |
| `packages/typescript-config` | Shared tsconfig bases (`base`, `node-app`, `react-library`)                                          |
| `packages/eslint-config`     | Shared eslint configs (`base`, `react-internal`)                                                     |

## Build flow

`turbo run build` topo-sorts via `^build`:

1. `@canary/protocol` + `@canary/typescript-config` + `@canary/eslint-config` (no build, source-distributed)
2. `@canary/daemon` builds → emits `dist/daemon.bundle.mjs` + `dist/sandbox-client.js`
3. `@canary/browser` prebuild reads `apps/canary-daemon/dist/*` and writes `src/assets/embedded.generated.ts`, then builds
4. `@canary/cli` (the canary QA CLI) builds and its `build:viewer` esbuild step bundles `@canary/viewer/entry` into `apps/canary/assets/viewer-bundle.{js,css}`

## Validation

Before committing:

```bash
pnpm install
pnpm check     # turbo: compile + lint + test
```

Per-workspace:

```bash
pnpm --filter @canary/daemon test
pnpm --filter @canary/browser test
pnpm --filter @canary/cli test
```

## Provenance

Canary is forked from the TypeScript portion of [`dev-browser`](https://github.com/SawyerHood/dev-browser) (MIT, Sawyer Hood). The Rust and Go CLI implementations were dropped during migration; the daemon, the TS CLI, and the `proof` workflow are the basis for `canary-daemon`, `canary-browser`, and `canary` respectively.
