- `page.snapshotForAI()` returns `{ full, incremental? }` — `full` is an aria outline of the
  page: roles, accessible names, `[ref=eN]` markers on actionable nodes. Read it to pick a
  semantic selector — `page.getByRole("button", { name: "Continue" })`,
  `page.getByText("Sign in")` — then act.
- Options `{ track?, depth?, timeout? }`: re-run `page.snapshotForAI({ track: "main" })` after
  the page changes to get just the `incremental` diff; `{ depth: N }` caps the tree on huge
  pages; `timeout` bounds the walk.
- `page.locator("aria-ref=e12")` works for an immediate action in the same script only — refs go
  stale across steps and after navigations. Prefer re-deriving a semantic selector.
