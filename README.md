# Canary

**AI-agent QA toolkit.** Drive a real browser from a CLI: persistent named pages, sandboxed JavaScript, headless or headed.

This repository is a pnpm + Turborepo monorepo. Two apps and three packages cooperate to make agent-driven browser automation reproducible.

## Repo layout

```
canary/
├── apps/
│   ├── canary-browser/     # @canary/browser     bin: canary-browser  — browser-automation engine
│   └── canary-daemon/      # @canary/daemon      no bin               — Playwright + QuickJS runtime
├── packages/
│   ├── protocol/           # @canary/protocol               IPC schemas (Zod), single source of truth
│   ├── config/             # @canary/config                 shared tsconfig bases
│   └── logger/             # @canary/logger                 pino-backed structured logger
├── skills/canary/          # Claude Code / Codex / Cursor / Gemini / Windsurf / opencode skill
└── .github/                # CI
```

`canary-browser` (the engine CLI) embeds and supervises `canary-daemon` (the long-running Playwright host).

## Quickstart

```bash
make install   # pnpm install across the workspace
make build     # build everything in topo order
make test      # run all tests
make check     # compile + lint + test (what CI runs)
```

Run `make` with no args to see all targets.

## Conventions

- **Conventional Commits** enforced via `commitlint` + a husky `commit-msg` hook.
- **Linting & formatting** via [Ultracite](https://docs.ultracite.ai/) (Biome) — `pnpm lint` checks, `pnpm format` autofixes.
- **Pre-commit** runs `lint-staged` → `ultracite fix` (Biome) on staged files.
- **Logging** via `@canary/logger` (pino, structured). Set `CANARY_LOG_LEVEL` (trace|debug|info|warn|error|silent); the CLI also accepts `--verbose`/`-v`.
- **Node 20+** and **pnpm 9.15.0** (see `.nvmrc` and `packageManager`).
- **Turbo** orchestrates builds (`turbo run build`, `dev`, `test`, `compile`); lint/format run via Ultracite at the root.

## More

- [`AGENTS.md`](AGENTS.md) — orientation for AI agents working in this repo
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution flow
- [`RELEASING.md`](RELEASING.md) — release pipeline
