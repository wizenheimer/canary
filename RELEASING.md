# Releasing

> **Status:** placeholder — release pipeline lands in a follow-up.

Today canary is unpublished; all package versions stay at `0.1.0` and `private: true`. The migration window is the wrong time to also wire up npm publishing.

When we do publish, the plan is:

1. Bump versions via `scripts/sync-version.mjs <new-version>` (writes the same version to every workspace `package.json` + `.claude-plugin/marketplace.json`).
2. Commit the bump and tag `v<version>`.
3. CI cross-publishes `@canary/cli` (bin: `canary`) and `@canary/browser` (bin: `canary-browser`) to npm; `@canary/daemon` stays private (embedded into `canary-browser`).

For now: keep working on `feat/*` branches, merge into `main`, no tags.
