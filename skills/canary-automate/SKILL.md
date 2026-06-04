---
name: canary-automate
description: Drive a real browser for a one-off task with Canary — navigate, click, fill, scrape, screenshot — and return the result. Nothing is recorded. Use when the user asks to automate a browser task, scrape a page, fill a form, or check something on a site without needing a report. Trigger phrases — "go to X and get Y", "scrape this page", "automate this browser task", "log in and check", "take a screenshot of".
license: MIT
metadata:
  author: usecanary
  version: 0.1.0
  category: workflow
  tags:
    - canary
    - browser-automation
    - scraping
---

# Canary automate (one-off)

Run a script against a real browser and return the result — ephemeral, nothing recorded. Use the
**canary-scripting** skill for the API.

## When to use

- A quick, one-shot browser task: navigate, extract, fill, screenshot.
- Scraping or checking a page where you don't need a trace / video / report.
- For a recorded, verifiable run **with** a report, use **canary-session** instead.

## Examples

### Example 1: scrape
User says: "get the top 10 Hacker News titles" or "scrape the headlines"
Write a script that opens the page and `evaluate`s the data, run it, return the JSON it logs.

### Example 2: check
User says: "is the pricing page up and what's the headline?" or "screenshot the homepage"
`goto`, read the element (or `screenshot`), report.

## Workflow

1. If the runtime isn't installed: `npx @usecanary/cli install` (one-time; downloads Chromium).
2. Write a short, focused script with the canary-scripting API (`browser.getPage`, `page.goto`,
   `locator`/`evaluate`, `console.log` the result). Unknown page? Don't guess selectors blind —
   snapshot first (`(await page.snapshotForAI()).full`), then act on what you see.
3. Run it: `npx @usecanary/browser run ./script.js` (or pipe the script via stdin).
4. If the result is empty or a selector missed, **observe and retry**: run a second short script that
   logs `page.url()`, `page.title()`, and `(await page.snapshotForAI()).full` (or a targeted
   `locator(...).count()`), pick a better selector, re-run. Named pages persist between runs, so
   state carries over.
5. Report the script's stdout. On optional extractions, degrade gracefully (log a `WARN`, don't
   crash) — but don't paper over a miss you can fix by observing.
6. Cleanup (optional): the run leaves a shared background daemon up for reuse. To shut it (and any
   browser) down, run `npx @usecanary/browser stop` (alias of `canary stop` / `canary daemon stop`).
