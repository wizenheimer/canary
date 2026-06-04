- `page.goto(url, { waitUntil: "domcontentloaded" })` — navigate; `waitUntil` is `"load"` /
  `"domcontentloaded"` / `"networkidle"` (prefer `"domcontentloaded"` on dev servers)
- `page.title()` / `page.url()` — current title / URL
- `page.snapshotForAI(options)` — AI-optimized page outline; returns `{ full, incremental? }`;
  options `{ track?, depth?, timeout? }`
- `page.getByRole(role, { name })` / `page.getByText(text)` — semantic locators (survive re-renders)
- `page.textContent(sel)` / `page.innerText(sel)` / `page.innerHTML(sel)` /
  `page.getAttribute(sel, name)` — read by selector
- `page.inputValue(sel)` / `page.isChecked(sel)` / `page.isVisible(sel)` / `page.isHidden(sel)` —
  input and visibility state
- `page.fill(sel, value)` / `page.click(sel)` / `page.type(sel, text)` / `page.press(sel, key)` —
  act on elements
- `page.waitForSelector(sel, { state, timeout })` (`state`: `"attached"` / `"visible"` /
  `"hidden"` / `"detached"`) / `page.waitForURL(pattern)` / `page.waitForLoadState(state)` /
  `page.waitForFunction(fn)` / `page.waitForTimeout(ms)` — waiting
- `page.screenshot({ fullPage })` — capture a screenshot Buffer; save it with `saveScreenshot(...)`
- `page.evaluate(fn[, arg])` / `page.$eval(sel, fn)` / `page.$$eval(sel, fn)` — run plain
  JavaScript in the page context (real DOM; args/returns must be serializable)
- `page.locator(sel)` — a Locator for chained actions (`.click()`, `.fill(value)`,
  `.textContent()`, `.first()`, …)
- `page.keyboard.press/type/down/up(...)` / `page.mouse.move/click/down/up(...)` — low-level input
- `page.reload()` / `page.goBack()` / `page.goForward()` — history;
  `page.content()` / `page.setContent(html)` — full HTML
- `page.on("console", handler)` — observe page console events
