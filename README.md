# Canary

**AI-agent QA toolkit.** Drive a real browser, record everything that happens (DOM, console, network, storage), and emit a self-contained HTML artifact your agent — or you — can replay later.

This repository is a pnpm + Turborepo monorepo. Three apps and four packages cooperate to make agent-driven verification reproducible.

## Repo layout

```
canary/
├── apps/
│   ├── canary/             # @canary/cli         bin: canary          — the QA workflow CLI
│   ├── canary-browser/     # @canary/browser     bin: canary-browser  — browser-automation engine
│   └── canary-daemon/      # @canary/daemon      no bin               — Playwright + QuickJS runtime
├── packages/
│   ├── protocol/           # @canary/protocol               IPC schemas (Zod), single source of truth
│   ├── viewer/             # @canary/viewer                 React viewer, source-distributed
│   ├── typescript-config/  # @canary/typescript-config      shared tsconfig bases
│   └── eslint-config/      # @canary/eslint-config          shared eslint configs
├── docs/                   # architecture deep-dives
├── skills/canary/          # Claude Code / Codex / Cursor / Gemini / Windsurf / opencode skill
├── .claude-plugin/         # marketplace manifest
└── .github/                # CI
```

`canary` (the QA CLI) shells out to `canary-browser` (the engine CLI), which embeds and supervises `canary-daemon` (the long-running Playwright host).

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
- **Pre-commit** runs `lint-staged` (prettier on staged files).
- **Node 20+** and **pnpm 9.15.0** (see `.nvmrc` and `packageManager`).
- **Turbo** orchestrates builds (`turbo run build`, `dev`, `test`, `lint`, `compile`).

## More

- [`docs/`](docs/) — architecture, CLIs, daemon, recorder, viewer, releasing
- [`AGENTS.md`](AGENTS.md) — orientation for AI agents working in this repo
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution flow
- [`RELEASING.md`](RELEASING.md) — release pipeline
