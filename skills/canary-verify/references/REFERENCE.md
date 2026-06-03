# Canary verify — diff → workflow heuristics & plan template

Two parts: (1) map a code diff to the **user-facing workflows** at risk, and (2) the shape of the QA
plan you hand back. Group findings by *workflow*, never by file.

## Mapping changes to workflows

| Changed file / area | What a user exercises | How to verify | Default priority |
|---|---|---|---|
| **Route / page files** (`routes/`, `pages/`, `app/`, `*.routes.*`, Next/Remix/React-Router config) | The changed route is a directly testable URL — highest signal | Navigate to the route; assert it renders and the changed behavior works | P0–P1 |
| **Page components / views** (`*.tsx`/`*.vue`/`*.svelte` in feature dirs) | Trace upward to the route(s) that render them; that route is the entry | Open the route; exercise the component | P1 |
| **API route handlers / server actions** (`api/`, `route.ts`, controllers) | The UI flow that calls them | Drive the page that triggers the request; assert the rendered result (the session **HAR** captures the request as evidence) | P0–P1 |
| **Shared components / hooks / design-system** | Fan-out — many routes consume them | List the top consuming routes; 2–3 highest-traffic as P0, the rest P2 | P0 / P2 |
| **State / data layer / migrations** | Flows that read or write that data | Exercise the flow; assert the rendered values | P1 |
| **Auth / middleware / redirects** | Login, protected-route, logout — highest blast radius | Verify each path; assert redirects and gated access | P0 |
| **Config / build / deps / CI / tests / types-only / docs** | Usually no browser surface | **No browser QA** — note and skip | — |

## Finding the URL for a route

- `grep`/Glob the router for the changed path to recover the route pattern.
- Read `package.json` scripts for the `dev` command and its base URL (Vite `5173`, Next `3000`, …).
  Don't assume `localhost:3000` — confirm it or ask.
- Monorepo: bucket changed files by app/workspace first; only web app(s) get browser flows. CLI/lib
  changes → "no browser QA" (or suggest **canary-automate** / unit tests instead).

## Choosing stable selectors

When a page's structure is unknown, a probe step can call `await page.snapshotForAI()` — an
LLM-friendly DOM snapshot (see **canary-scripting**) — to pick stable roles/text before writing the
assert step. Prefer role/text selectors over brittle CSS.

## Prioritization rubric

- **P0** — auth, checkout, payment, data-mutating flows, or a directly-changed route. Verify first.
- **P1** — adjacent flows that share a changed component or call a changed endpoint.
- **P2** — low-traffic fan-out from a shared util; verify if time allows.

## Edge cases

- **Renames / deletions** — a deleted route → assert 404 / redirect / link gone; a rename → verify the
  new path works (and the old one redirects, if applicable).
- **Huge diffs** — ignore lockfiles, `dist/`, generated dirs, and formatting-only churn; prefer
  `--name-status` and summarize "N files, M relevant to UI" so the plan stays focused.
- **Backend-only change with UI impact** — map to the UI flow that calls it; assert on the rendered
  result, with the HAR as evidence.

## QA-plan output template

```
## QA plan for <change ref>

Affected workflows (most → least likely to regress):

### [P0] <workflow> — <one-line intent>
- Entry: <url or route>   (dev server: <command / base url>)
- Steps:
  1. open   — goto <url>, wait for <stable selector>
  2. act    — <click / fill / navigate …>
  3. assert — expect <visible text | state | no console error | network 2xx>
- At risk because: <the changed file(s)>

### [P1] <workflow> — …
### [P2] <workflow> — …

Not testing in the browser: <files that are refactor / config / types-only — and why>

Recommend recording: P0 (+ P1 if time). Record as a Canary session? (which flows)
```
