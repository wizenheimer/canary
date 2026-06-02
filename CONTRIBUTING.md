# Contributing

Thanks for your interest in canary.

## Before you open a PR

1. Open an issue first to discuss substantial changes — bugfixes are welcome directly.
2. Run `make check` locally; CI runs the same.
3. Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.) — the `commit-msg` hook enforces this.

## Dev loop

```bash
make install     # pnpm install
make build       # build everything
make test        # run all tests
make check       # what CI runs
```

Per-workspace:

```bash
pnpm --filter @canary/daemon  dev   # daemon in watch mode
pnpm --filter @canary/browser dev   # CLI in watch mode
pnpm --filter @canary/cli     dev   # canary in watch mode
```

## House rules

- No `console.*` in committed code — use `@canary/logger` for diagnostics and `process.stdout` for CLI output (enforced by Biome's `noConsole`).
- All new code is TypeScript with `strict: true` and no `any`.
- Tests are vitest; colocated for daemon, in `test/` for cli + canary.
- Ultracite (Biome) formats and lints everything; the pre-commit hook runs `ultracite fix` on staged files (`pnpm lint` / `pnpm format` to run manually).
