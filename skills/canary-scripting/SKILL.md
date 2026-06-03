---
name: canary-scripting
description: The Canary sandbox scripting API for browser automation. Use when writing or debugging a Canary script — looking up how to open a page, click, fill, extract text, evaluate in the page, take a screenshot, persist data between steps, or understand sandbox limits (no imports, timeouts). Trigger phrases — "how do I click in canary", "canary page API", "saveScreenshot signature", "get text from the page", "why is my canary script timing out", "open a new tab in canary".
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

## The essentials

- **Globals:** `browser.getPage(name)` / `browser.newPage()` / `browser.listPages()` / `browser.closePage(name)`; top-level `saveScreenshot(buffer, name)`, `writeFile(name, data)`, `readFile(name)`; `console.log` (captured).
- **Named pages persist** across steps in a session; anonymous `newPage()` tabs are closed after each script. One **primary named page per step** keeps the per-step report screenshot correct.
- **No module system** — no `import`/`require`. Inline any helpers.
- **Timeouts** — both CPU and wall-clock are enforced; long loops or unresolved promises abort the script.

For the **complete API** — every page/locator/`browser` method, signatures, the per-step screenshot rule, and sandbox limits — see [`references/REFERENCE.md`](references/REFERENCE.md).
