# Demo scripts (dev only)

Sample browser-automation scripts used to **seed the session viewer** and as **end-to-end smoke
tests**. They are **not** shipped to end users (not in any package's `files`) — they live here for
development.

Each script uses the sandbox API (`browser.getPage`, `page.goto`, `page.evaluate`, `page.locator`,
`saveScreenshot(buffer, name)`, `console.log`). They navigate live sites, so selectors drift — treat
them as starting points and update as needed.

## Run a quick one-off (no recording)

```bash
canary install                        # once: downloads Chromium
canary-browser run examples/hacker-news/demo.js
```

## Record a session you can open in the viewer

```bash
id=$(canary session start --name "Hacker News demo")
canary run examples/hacker-news/demo.js --session "$id" --step "browse"
canary session end "$id"
canary ui                             # browse the recorded session (in this repo); end users: canary-viewer
```

Demos: `hacker-news/`, `product-hunt/`, `github-trending/`, `wikipedia/`.
