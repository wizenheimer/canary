// Product Hunt — browse today's launches. Dev fixture (PH is a SPA; selectors
// drift and content may be gated — degrade gracefully).
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const page = await browser.getPage("ph");
await page.goto("https://www.producthunt.com/", { waitUntil: "domcontentloaded" });
console.log("Opened:", await safe(() => page.title(), "(no title)"));
await safe(() => page.waitForSelector("section, main", { timeout: 15000 }));

// Best-effort: pull launch names + taglines from the feed.
const launches = await safe(
  () =>
    page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href^="/posts/"]')];
      const seen = new Set();
      const out = [];
      for (const a of links) {
        const name = a.textContent?.trim();
        const href = a.getAttribute("href");
        if (name && href && !seen.has(href) && name.length > 1) {
          seen.add(href);
          out.push({ name, href });
        }
        if (out.length >= 10) {
          break;
        }
      }
      return out;
    }),
  []
);
console.log(JSON.stringify({ count: launches.length, launches }, null, 2));

const shot = await page.screenshot({ fullPage: false });
await saveScreenshot(shot, "product-hunt.png");
