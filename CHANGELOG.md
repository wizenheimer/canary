# Changelog

## Unreleased

### Added

- Initial canary monorepo scaffold (pnpm + Turborepo).
- Forked from the TypeScript portion of `dev-browser` (MIT, Sawyer Hood). Migrated:
  - `proof/` → `apps/canary/` (QA workflow CLI, bin: `canary`)
  - `cli-ts/` → `apps/canary-browser/` (browser engine CLI, bin: `canary-browser`)
  - `daemon/` → `apps/canary-daemon/` (internal Playwright host)
  - `proof/src/viewer/bundle/` → `packages/viewer/` (source-distributed React)
  - `daemon/src/protocol.ts` → `packages/protocol/` (single source of truth)
- Shared `@canary/typescript-config` and `@canary/eslint-config` packages.
- Dropped the Rust and Go CLI implementations and their docs entirely.
