// find the existing logged-in tab
const pages = await browser.listPages();
const appTab = pages.find(p => p.url && !p.url.startsWith("about:") && !p.url.startsWith("chrome:"));
if (!appTab) throw new Error("No app tab found — navigate to your app in Chrome first.");

const page = await browser.getPage(appTab.id);
const origin = new URL(appTab.url).origin;
console.log("Attached to: " + appTab.url);
console.log("Origin: " + origin);

const visited = new Set();
const errors = [];
const toVisit = [appTab.url];

// collect same-origin links from current page
async function collectLinks() {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  return await page.evaluate((origin) => {
    const links = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) continue;
      try {
        const url = new URL(href, origin);
        if (url.origin === origin) links.add(url.origin + url.pathname);
      } catch {}
    }
    return [...links];
  }, origin);
}

while (toVisit.length > 0) {
  const url = toVisit.shift();
  if (!url || visited.has(url)) continue;
  visited.add(url);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    const status = response ? response.status() : "unknown";
    await page.waitForTimeout(1500);

    if (status >= 400) {
      errors.push({ url, error: "HTTP " + status });
      console.log("HTTP ERROR " + status + " on " + url);
    }

    // check for visible UI errors on page
    const pageErrors = await page.evaluate(() => {
      const els = document.querySelectorAll("[class*='error']:not(script), [role='alert']");
      return [...els].map(el => el.innerText?.trim()).filter(t => t && t.length > 2);
    });
    if (pageErrors.length > 0) {
      errors.push({ url, error: "UI error: " + pageErrors.join(" | ") });
      console.log("UI ERROR on " + url + ": " + pageErrors.join(" | "));
    }

    await saveScreenshot(await page.screenshot({ fullPage: true }), "page-" + Date.now() + ".png");
    console.log("Visited: " + url + " [" + status + "]");

    // collect links from this page and queue unvisited ones
    const links = await collectLinks();
    console.log("  Found " + links.length + " links on this page");
    for (const link of links) {
      if (!visited.has(link)) {
        console.log("  Queuing: " + link);
        toVisit.push(link);
      }
    }
  } catch (err) {
    errors.push({ url, error: String(err) });
    console.log("ERROR on " + url + ": " + String(err));
  }
}

await writeFile("errors.json", JSON.stringify(errors, null, 2));
console.log("===========================");
console.log("Done. Visited: " + visited.size + " pages.");
console.log("Errors found: " + errors.length);
if (errors.length > 0) {
  console.log("Error summary:");
  for (const e of errors) console.log("  - [" + e.url + "] " + e.error);
}
