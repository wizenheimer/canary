# Demo scripts (dev only)

Sample browser-automation scripts used to **seed the session viewer** and as **end-to-end smoke
tests**. They are **not** shipped to end users (not in any package's `files`) — they live here for
development.

Each script uses the sandbox API (`browser.getPage`, `page.goto`, `page.evaluate`, `page.locator`,
`saveScreenshot(buffer, name)`, `console.log`). They navigate live sites, so selectors drift — treat
them as starting points and update as needed.

## Run a quick one-off (no recording)

```bash
npx @usecanary/cli install            # once: downloads Chromium
npx @usecanary/browser run examples/hacker-news/demo.js
```

## Record a session you can open in the viewer

```bash
id=$(npx @usecanary/cli session start --name "Hacker News demo")
npx @usecanary/cli run examples/hacker-news/demo.js --session "$id" --step "browse"
npx @usecanary/cli session end "$id"
npx @usecanary/ui                     # browse the recorded session
```

Demos: `hacker-news/`, `product-hunt/`, `github-trending/`, `wikipedia/`.
