# Canary scripting API — full reference

Scripts run in a QuickJS sandbox. The body is top-level JavaScript with `await`. Available globals:
`browser`, `console`, `saveScreenshot`, `writeFile`, `readFile`. No `import`/`require`, no Node APIs.

## `browser`

| Method | Returns | Notes |
|---|---|---|
| `browser.getPage(name)` | `Page` | Get-or-create a **named** page. Persists across steps in a session — call with the same name to reuse the tab. |
| `browser.newPage()` | `Page` | An **anonymous** page. Auto-closed when the script ends; does not persist. |
| `browser.listPages()` | `string[]` | Names of currently open pages. |
| `browser.closePage(name)` | `void` | Close a named page. |

## Top-level file helpers

| Global | Signature | Notes |
|---|---|---|
| `saveScreenshot` | `saveScreenshot(buffer, name)` | **Buffer first.** Writes to `~/.canary/tmp/`. Useful for debugging — but it is **not** the per-step report screenshot (see below). |
| `writeFile` | `writeFile(name, data)` | Persist a small file (e.g. JSON state) to `~/.canary/tmp/` to pass data between steps. |
| `readFile` | `readFile(name)` | Read it back (returns the contents). |

## `Page`

Navigation: `goto(url, { waitUntil })` (`waitUntil`: `"load"` \| `"domcontentloaded"` \| `"networkidle"`),
`reload()`, `goBack()`, `goForward()`, `waitForURL(pattern)`, `waitForLoadState(state)`.

Inspection: `title()`, `url()`, `content()`, `setContent(html)`.

Waiting: `waitForSelector(selector, { state, timeout })` (`state`: `"attached"|"visible"|"hidden"|"detached"`),
`waitForTimeout(ms)`, `waitForFunction(fn)`.

Reading by selector: `textContent(sel)`, `innerText(sel)`, `innerHTML(sel)`, `getAttribute(sel, name)`,
`inputValue(sel)`, `isChecked(sel)`, `isVisible(sel)`, `isHidden(sel)`.

Scripting in the page: `evaluate(fn[, arg])`, `$eval(sel, fn)`, `$$eval(sel, fn)`. `fn` runs in the page
context (real DOM); args/returns must be serializable.

Input: `keyboard.press/type/down/up(...)`, `mouse.move/click/down/up(...)`.

Capture: `screenshot({ fullPage })` → `Buffer`.

Events: `page.on("console", (msg) => …)`. Note: `console.log` **inside** `page.evaluate(() => console.log(…))`
is captured into the session's console artifact; top-level `console.log` goes to the run's stdout.

## `Locator` — `page.locator(selector)`

Actions: `.click()`, `.fill(value)`, `.check()`, `.uncheck()`, `.selectOption(value)`, `.hover()`, `.focus()`.
Reads: `.textContent()`, `.innerText()`, `.getAttribute(name)`, `.inputValue()`, `.count()`.
State: `.isVisible()`, `.isEnabled()`, `.isChecked()`.
Refine: `.first()`, `.last()`, `.nth(i)`, `.filter({ hasText })`, `.all()` (→ `Locator[]`).
Semantic factories (also `Locator`): `page.getByRole(role, { name })`, `page.getByText(text)`.

## Observing the page — `snapshotForAI`

| Call | Returns | Notes |
|---|---|---|
| `page.snapshotForAI()` | `{ full, incremental? }` | `full` = aria outline of the page: roles, accessible names, `[ref=eN]` markers on actionable nodes. |
| `page.snapshotForAI({ track: "main" })` | `{ full, incremental }` | Re-snapshot after a change; `incremental` is the diff since the last tracked snapshot. |
| options | `{ track?, depth?, timeout? }` | `depth` caps tree depth on huge pages; `timeout` bounds the walk. |

Acting on what you saw:

- Prefer a **semantic selector** re-derived from the snapshot — `page.getByRole("link", { name: "Cart" })`,
  `page.getByText("Sign in")` — it survives re-renders.
- `page.locator("aria-ref=e12")` works for an immediate action **in the same script only**; refs go
  stale across steps and after navigation.

Keeping it small:

- Snapshot once to orient; after the page changes, use `{ track }` incrementals instead of a full re-dump.
- Pass `{ depth: N }` on huge pages, or skip the snapshot and read just the region you care about with
  targeted `locator(sel).count()` / `.innerText()`.

```js
// Explore an unknown page (one observe step), then act on what you saw (next step)
const page = await browser.getPage("main");
await page.goto(url, { waitUntil: "domcontentloaded" });
const snap = await page.snapshotForAI({ depth: 12 });
console.log(page.url(), await page.title());
console.log(snap.full); // read this to pick a role/text selector
// …next step: await page.getByRole("button", { name: "Sign in" }).click();
```

## The per-step screenshot rule (sessions)

After each `canary run --step`, the daemon **auto-captures one screenshot** of the **last-opened tab**
(`pages.at(-1)`) and binds it to that step in the report. So:

- Keep **one primary named page per step** → the report screenshot is always the page you mean.
- If a step opens several tabs, open the one you want featured **last**.
- `saveScreenshot(...)` images land in `~/.canary/tmp/` and are **not** in the report — they're extras for debugging.

## Sandbox limits

- **No module system.** No `import`/`require`. Inline helpers (a small `safe()`/`sleep()` at the top).
- **No Node APIs** (`fs`, `process`, …). Use the file helpers for persistence.
- **Timeouts.** CPU time and wall-clock are both bounded; infinite loops or never-settling promises abort
  the script (override the wall-clock budget per step with `canary run --timeout <seconds>`).
- **Serialization.** Values crossing `evaluate`/`$eval` must be JSON-serializable.

## Resilience pattern (recommended for assertion / extraction steps)

Scope: WARN-don't-crash is for **assertion/extraction** steps, so a miss still records its evidence.
While **exploring**, a selector that isn't there means look again — snapshot, fix the selector, retry
as a new step — not a silent fallback.

```js
const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await browser.getPage("main");
await page.goto("https://news.ycombinator.com", { waitUntil: "domcontentloaded" });
const ok = await safe(() => page.waitForSelector("tr.athing", { timeout: 15000 }).then(() => true), false);
if (!ok) {
  console.log("WARN: rows not found — page changed or rate-limited");
} else {
  const titles = await safe(() => page.evaluate(() =>
    [...document.querySelectorAll("span.titleline > a")].slice(0, 10).map((a) => a.textContent)
  ), []);
  console.log(JSON.stringify(titles));
}
```
