// Wikipedia — open an article, read its lead, then hop to a linked article.
// Dev fixture: Wikipedia markup is stable, so this is the most reliable demo.
const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const lead = () =>
  page.evaluate(() => {
    const title = document.querySelector("h1")?.textContent?.trim() ?? null;
    const para = [...document.querySelectorAll("#mw-content-text p")].find(
      (p) => p.textContent && p.textContent.trim().length > 80
    );
    return { title, lead: para?.textContent?.trim().slice(0, 280) ?? null };
  });

const page = await browser.getPage("wiki");
await page.goto("https://en.wikipedia.org/wiki/Web_browser", {
  waitUntil: "domcontentloaded",
});
console.log("Article 1:", JSON.stringify(await safe(lead, {}), null, 2));

// Hop to the first in-body article link (skip Special:/File:/Help: namespaces).
const next = await safe(
  () =>
    page.evaluate(() => {
      const a = [...document.querySelectorAll("#mw-content-text p a[href^='/wiki/']")].find(
        (x) => !x.getAttribute("href").includes(":")
      );
      return a?.getAttribute("href") ?? null;
    }),
  null
);
if (next) {
  await page.goto(new URL(next, "https://en.wikipedia.org").href, {
    waitUntil: "domcontentloaded",
  });
  console.log("Hopped to:", JSON.stringify(await safe(lead, {}), null, 2));
}

const shot = await page.screenshot({ fullPage: false });
await saveScreenshot(shot, "wikipedia.png");
