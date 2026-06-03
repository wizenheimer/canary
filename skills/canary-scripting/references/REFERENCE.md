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

## Resilience pattern (recommended for demos / live sites)

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
