// Hacker News — browse the front page, read the top stories, peek at a thread.
// Dev fixture: navigates a live site, degrades gracefully if selectors change.
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const page = await browser.getPage("hn");
await page.goto("https://news.ycombinator.com/news", { waitUntil: "domcontentloaded" });
console.log("Opened:", await safe(() => page.title(), "(no title)"));
await safe(() => page.waitForSelector("tr.athing", { timeout: 15000 }));

// Top stories: title, url, score, comments link.
const stories = await safe(
  () =>
    page.evaluate(() =>
      [...document.querySelectorAll("tr.athing")].slice(0, 10).map((row) => {
        const a = row.querySelector("span.titleline > a");
        const sub = row.nextElementSibling;
        const score = sub?.querySelector("span.score");
        const comments = sub && [...sub.querySelectorAll('a[href^="item?id="]')].pop();
        return {
          title: a?.textContent?.trim() ?? null,
          url: a?.href ?? null,
          score: score ? Number.parseInt(score.textContent, 10) : null,
          commentsHref: comments?.getAttribute("href") ?? null,
        };
      })
    ),
  []
);
console.log(JSON.stringify({ count: stories.length, stories }, null, 2));

// Follow the first story's discussion, read a few comments.
const first = stories.find((s) => s.commentsHref);
if (first) {
  await page.goto(new URL(first.commentsHref, "https://news.ycombinator.com/").href, {
    waitUntil: "domcontentloaded",
  });
  const comments = await safe(
    () =>
      page.evaluate(() =>
        [...document.querySelectorAll("div.commtext")]
          .slice(0, 5)
          .map((c) => c.textContent?.trim().slice(0, 160) ?? "")
      ),
    []
  );
  console.log(`Read ${comments.length} comments on: ${first.title}`);
}

const shot = await page.screenshot({ fullPage: false });
await saveScreenshot(shot, "hacker-news.png");
