# Changelog

## Unreleased

### Added

- Initial canary monorepo scaffold (pnpm + Turborepo).
- Bootstrapped from MIT-licensed upstream work by Sawyer Hood (see `LICENSE`). Migrated:
  - `cli-ts/` → `apps/canary-browser/` (browser engine CLI, bin: `canary-browser`)
  - `daemon/` → `apps/canary-daemon/` (internal Playwright host + QuickJS sandbox)
  - `daemon/src/protocol.ts` → `packages/protocol/` (Zod schemas, single source of truth)
- Shared `@canary/config` package (tsconfig bases).
- `@canary/logger` — shared pino-backed structured logging, used by the daemon
  (writes to `~/.canary/daemon.log`) and the CLI (stderr; `--verbose` /
  `CANARY_LOG_LEVEL`).
- [Ultracite](https://docs.ultracite.ai/) (Biome) for linting + formatting,
  enforced in CI; replaced Prettier and removed the unused eslint-config package.
- Dropped the Rust and Go CLI implementations and their docs entirely.
