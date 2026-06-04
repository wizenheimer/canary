---
name: canary-scripting
description: The Canary sandbox scripting API for browser automation. Use when writing or debugging a Canary script — looking up how to open a page, click, fill, extract text, observe an unknown page with snapshotForAI, evaluate in the page, take a screenshot, persist data between steps, or understand sandbox limits (no imports, timeouts). Trigger phrases — "how do I click in canary", "canary page API", "what's on this page", "explore a page in canary", "snapshotForAI", "saveScreenshot signature", "get text from the page", "why is my canary script timing out", "open a new tab in canary".
license: MIT
metadata:
  author: usecanary
  version: 0.1.0
  category: reference
  tags:
    - canary
    - browser-automation
    - playwright
    - scripting
---

# Canary scripting API

Canary scripts are plain **async JavaScript** run in a QuickJS sandbox with a Playwright-like API.
Both `canary-browser run` (one-off) and `canary run --session` (recorded step) execute the same way:
top-level `await`, with `browser`, `console`, and the file helpers available as globals.

## When to use

- Writing a script to drive a browser with Canary
- Looking up a page or locator method (`goto`, `locator`, `evaluate`, `waitForSelector`, `screenshot`)
- Persisting a page or a file between steps of a session
- Debugging a timeout, a missing global, or a "page closed" error

## Examples

### Example 1: open a page and read it
User says: "navigate to a site and get the title in canary" or "how do I read text off the page?"
Use a **named** page so it persists across steps, then `goto` and `evaluate`/`locator`. See *Quick start*.

### Example 2: click / fill / extract
User says: "click the login button", "fill the search box", "scrape the headlines"
`page.locator(selector)` then `.click()` / `.fill(value)` / `.textContent()`; or `page.evaluate(fn)` to pull structured data in one round-trip.

### Example 3: screenshot
User says: "take a screenshot" or "what's the saveScreenshot signature?"
`const buf = await page.screenshot({ fullPage: true }); await saveScreenshot(buf, "home.png");` — note **buffer first**, and that `saveScreenshot` is a top-level global, not `browser.saveScreenshot`.

### Example 4: observe an unknown page
User says: "I don't know the selectors", "what's on this page?", "explore before acting"
`(await page.snapshotForAI()).full` → an aria outline of the page. Read it to pick a role/text selector, then act. See *Observing the page*.

## Quick start

```js
const page = await browser.getPage("main");          // named, persistent page
await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
console.log(await page.title());                       // captured in the session

const headings = await page.evaluate(() =>
  [...document.querySelectorAll("h1, h2")].map((h) => h.textContent.trim())
);
console.log(JSON.stringify(headings));

await page.locator("a.more").click();
const buf = await page.screenshot({ fullPage: false });
await saveScreenshot(buf, "page.png");                 // saveScreenshot(buffer, name)
```

## Observing the page

```js
const page = await browser.getPage("main");
const snap = await page.snapshotForAI();   // { full, incremental? }
console.log(page.url(), await page.title());
console.log(snap.full);                    // aria outline: roles, accessible names, [ref=eN] markers
```

- Read `full` to pick a **semantic selector** — `page.getByRole("button", { name: "Continue" })`,
  `page.getByText("Sign in")` — then act. `aria-ref=eN` refs work only within the same script; they
  go stale across steps and navigations.
- Options `{ track, depth, timeout }`: re-run `page.snapshotForAI({ track: "main" })` after the page
  changes to get just the `incremental` diff; `{ depth: N }` caps the tree on huge pages.
- **Unknown page → snapshot first, then interact. Known page/selectors → skip the snapshot** and use
  direct selectors — faster and more reliable.
- End each script by logging the state you need for the next decision — stdout is your observation
  channel.

## The essentials

- **Globals:** `browser.getPage(name)` / `browser.newPage()` / `browser.listPages()` / `browser.closePage(name)`; top-level `saveScreenshot(buffer, name)`, `writeFile(name, data)`, `readFile(name)`; `console.log` (captured).
- **`page.snapshotForAI()`** for structure discovery — returns `{ full, incremental? }`; read it in stdout to choose selectors.
- **Named pages persist** across steps in a session; anonymous `newPage()` tabs are closed after each script. One **primary named page per step** keeps the per-step report screenshot correct.
- **No module system** — no `import`/`require`. Inline any helpers.
- **Timeouts** — both CPU and wall-clock are enforced; long loops or unresolved promises abort the script.

For the **complete API** — every page/locator/`browser` method, signatures, the per-step screenshot rule, and sandbox limits — see [`references/REFERENCE.md`](references/REFERENCE.md).
