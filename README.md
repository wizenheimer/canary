# Canary

**AI-agent QA toolkit.** Drive a real browser from a CLI, record sessions (Playwright trace, video,
network HAR, console), and render self-contained verification reports you can browse in a local UI.

## Get started

```bash
npm create canary@latest         # guided setup (Ink wizard)

# …or à la carte (no global install needed):
npx @usecanary/cli install          # download Chromium + the runtime into ~/.canary
npx skills add usecanary/canary   # install the agent skills into your agent's skills dir
npx @usecanary/ui                   # open the session viewer (like `npx playwright show-trace`)
```

Record a session and view it:

```bash
id=$(npx @usecanary/cli session start --name "checkout")
npx @usecanary/cli run ./step.js --session "$id" --step "open"
npx @usecanary/cli session end "$id"     # -> ~/.canary/sessions/<id>/report.html
npx @usecanary/ui                        # browse it
```

## Agent integration (skills + plugins)

Canary ships as a Claude Code plugin, a Cursor plugin, a Codex plugin, and a generic
[Agent Skills](https://agentskills.io) pack — all pointing at the same `skills/` + `agents/` +
`commands/`. There's no bespoke installer; each agent's plugin/skills mechanism does the work.

```bash
# Claude Code
/plugin marketplace add usecanary/canary
/plugin install canary@canary-marketplace

# Cursor — install "canary" from the Marketplace, or symlink for local dev:
ln -sfn "$(pwd)" ~/.cursor/plugins/local/canary

# Codex
codex marketplace add usecanary/canary        # then /plugins → install "canary"

# Any Agent Skills tool (Windsurf, Codex, …) — skills only:
npx skills add usecanary/canary

# Claude Code, manual (skills only, no plugin):
cp -r skills/* ~/.claude/skills/
```

Skills: **`canary-scripting`** (the sandbox API, with `references/REFERENCE.md`) plus the workflow
skills **`canary-automate`**, **`canary-session`**, and **`canary-review`**. Each workflow pairs with
a subagent and a slash command — `/canary:run`, `/canary:session`, `/canary:review`.

## Repo layout

This repository is a pnpm + Turborepo monorepo: five apps and five packages cooperate to make
agent-driven browser automation reproducible.

```
canary/
├── apps/
│   ├── canary/             # @usecanary/cli      bin: canary          — session orchestrator (record QA sessions, render reports)
│   ├── canary-browser/     # @usecanary/browser  bin: canary-browser  — browser-automation engine (one-off runs)
│   ├── canary-daemon/      # @usecanary/daemon   no bin               — Playwright + QuickJS runtime (embedded into the CLIs)
│   ├── canary-ui/          # @usecanary/ui       bin: canary-viewer   — local session viewer (Next.js); `npx @usecanary/ui`
│   └── create-canary/      # create-canary    bin: create-canary   — `npm create canary` setup wizard (Ink)
├── packages/
│   ├── protocol/           # @usecanary/protocol         IPC schemas (Zod), single source of truth
│   ├── config/             # @usecanary/config           shared tsconfig bases
│   ├── logger/             # @usecanary/logger           pino-backed structured logger
│   ├── cli-kit/            # @usecanary/cli-kit          shared CLI helpers
│   └── daemon-client/      # @usecanary/daemon-client    daemon transport + lifecycle; embeds the daemon bundle
├── skills/                 # agent skills: canary-scripting (+references), -automate, -session, -review
├── agents/                 # JTBD subagents: automate-agent, session-agent, review-agent
├── commands/               # slash commands: /canary:run, :session, :review
├── .claude-plugin/         # Claude Code plugin + marketplace manifests
├── .cursor-plugin/         # Cursor plugin manifest (pairs with rules/)
├── plugins/canary/         # Codex plugin wrapper (.codex-plugin → canonical skills/)
├── .agents/                # Codex / agents marketplace manifest
├── rules/                  # Cursor rules (canary-workflows.mdc)
├── examples/               # dev-only demo scripts (Hacker News, Product Hunt, GitHub Trending, Wikipedia)
└── .github/                # CI
```

`canary` (the orchestrator) and `canary-browser` (the engine) both embed and supervise
`canary-daemon` (the long-running Playwright host). The viewer ships standalone and runs via npx.

## Develop

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
- **Logging** via `@usecanary/logger` (pino, structured). Set `CANARY_LOG_LEVEL` (trace|debug|info|warn|error|silent); the CLI also accepts `--verbose`/`-v`.
- **Node 20+** and **pnpm 9.15.0** (see `.nvmrc` and `packageManager`).
- **Turbo** orchestrates builds (`turbo run build`, `dev`, `test`, `compile`); lint/format run via Ultracite at the root.

## More

- [`AGENTS.md`](AGENTS.md) — orientation for AI agents working in this repo
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution flow
- [`RELEASING.md`](RELEASING.md) — publish pipeline (npm + the Claude Code plugin)
- [`examples/`](examples/) — runnable demo scripts (dev)
