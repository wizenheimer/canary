// GitHub Trending — read today's trending repos, then a language tab.
// Dev fixture: GitHub markup is fairly stable but still degrade gracefully.
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const extractRepos = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("article.Box-row")].slice(0, 10).map((row) => {
      const link = row.querySelector("h2 a");
      const desc = row.querySelector("p");
      const stars = row.querySelector('a[href$="/stargazers"]');
      return {
        repo: link?.getAttribute("href")?.replace(/^\//, "") ?? null,
        description: desc?.textContent?.trim() ?? null,
        stars: stars?.textContent?.trim() ?? null,
      };
    })
  );

const page = await browser.getPage("gh");
await page.goto("https://github.com/trending", { waitUntil: "domcontentloaded" });
console.log("Opened:", await safe(() => page.title(), "(no title)"));
await safe(() => page.waitForSelector("article.Box-row", { timeout: 15000 }));
console.log("All languages:", JSON.stringify(await safe(extractRepos, []), null, 2));

// Switch to the TypeScript daily tab (URL nav is more robust than the dropdown).
await page.goto("https://github.com/trending/typescript?since=daily", {
  waitUntil: "domcontentloaded",
});
await safe(() => page.waitForSelector("article.Box-row", { timeout: 15000 }));
console.log("TypeScript:", JSON.stringify(await safe(extractRepos, []), null, 2));

const shot = await page.screenshot({ fullPage: false });
await saveScreenshot(shot, "github-trending.png");
