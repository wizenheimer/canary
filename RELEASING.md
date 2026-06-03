# Releasing

Canary publishes a small set of public packages to npm under the `@usecanary` scope;
the rest stay private (bundled or embedded into the public ones).

## What publishes

| Package          | npm                | bin              | Notes                                              |
| ---------------- | ------------------ | ---------------- | -------------------------------------------------- |
| `@usecanary/cli`    | public             | `canary`         | Self-contained esbuild bundle (deps inlined)       |
| `@usecanary/browser`| public             | `canary-browser` | Self-contained bundle; embeds the daemon           |
| `@usecanary/ui`     | public             | —                | Next standalone; installed on demand into `~/.canary/ui` |
| `create-canary`  | public (unscoped)  | `create-canary`  | `npm create canary` setup wizard                   |
| `@usecanary/daemon` | **private**        | —                | Embedded as a string into the CLI bundles          |
| `@usecanary/protocol`, `@usecanary/logger`, `@usecanary/cli-kit`, `@usecanary/daemon-client`, `@usecanary/config` | **private** | — | Bundled into the CLIs by esbuild |

`@usecanary/daemon`'s Playwright runtime and `@usecanary/ui` are **not** package dependencies — they're
fetched into `~/.canary/` at runtime (`canary install` for the daemon, first `canary ui` for the viewer),
so a plain `npm i -g @usecanary/cli` stays small.

## Prerequisites (one-time)

1. **npm scope** — the `@usecanary` org (or user scope) must exist on npmjs.com, and the `NPM_TOKEN`
   repo secret must be an automation token with publish rights. Scoped packages publish with
   `--access public` (already in the workflow).
2. **`create-canary` name** — confirm the unscoped name `create-canary` is available/owned on npm.
3. **Provenance** — the release workflow sets `id-token: write` so npm records build provenance;
   the `repository` field in each manifest must point at this repo (it does).

## Cutting a release

The guided way — `make release` (wraps `scripts/release.sh`): it refuses a dirty/stale tree,
prompts for the bump (patch/minor/major or a custom version), bumps every package in lockstep,
refreshes the lockfile, validates the build + npm packaging (dry-run), creates the
`chore(release): vX.Y.Z` commit and the annotated tag — then **stops and hands you the push**:

```bash
make release                  # interactive: pick patch / minor / major
make release BUMP=minor        # non-interactive bump
make release VERSION=1.4.0      # explicit version
# env knobs: YES=1 (skip confirm) · NO_VERIFY=1 (skip build+dry-run) · ALLOW_DIRTY=1
```

It prints the exact push to run last. Pushing the tag is intentionally manual — that push is what
publishes to npm.

The manual equivalent, if you'd rather run the steps yourself:

```bash
node scripts/sync-version.mjs 0.2.0   # one version across every package.json + .claude-plugin/*
pnpm install                          # refresh the lockfile
git commit -am "chore(release): v0.2.0"  # NB: "release:" alone fails commitlint — use a conventional type
git tag v0.2.0
git push origin main --follow-tags
```

Pushing the tag triggers `.github/workflows/release.yml`, which verifies the tag matches the
workspace version, runs `pnpm build` (topo-ordered), and `pnpm -r publish --access public --provenance`.
`pnpm -r publish` automatically skips private packages and rewrites `workspace:*` to the concrete version.

## Verifying a build locally (no publish)

```bash
pnpm build
pnpm --filter @usecanary/cli pack         # -> canary-cli-<v>.tgz
tar -tf canary-cli-*.tgz               # expect only dist/ (and examples/), no node_modules
```
