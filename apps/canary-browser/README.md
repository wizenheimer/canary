# @usecanary/browser

`canary-browser` — the browser-automation engine for
[canary](https://github.com/usecanary/canary). Runs sandboxed JavaScript against a real Chromium
with persistent named pages. This is one-off automation (no recording); for recorded QA sessions
with a report, use [`@usecanary/cli`](https://www.npmjs.com/package/@usecanary/cli).

## Install

```bash
npx @usecanary/browser install
```

## Use

```bash
echo 'const p = await browser.getPage("main");
await p.goto("https://example.com");
console.log(await p.title());' | npx @usecanary/browser run

npx @usecanary/browser run ./script.js
```

Run `canary-browser --help` for the full API.

MIT · [source](https://github.com/usecanary/canary)
