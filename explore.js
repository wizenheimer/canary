const page = await browser.getPage("main");
const startUrl = page.url();
const origin = new URL(startUrl).origin;
console.log("Starting at: " + startUrl);

const visited = new Set();
const errors = [];
const toVisit = [startUrl];

// wait for JS-rendered content
async function waitForApp() {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
}

// collect all links after JS renders
async function collectLinks() {
  await waitForApp();
  return await page.evaluate((origin) => {
    const links = new Set();
    // standard anchor tags
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href;
      if (href.startsWith(origin)) links.add(href.split("#")[0]);
    }
    // data-href and router-link patterns common in SPAs
    for (const el of document.querySelectorAll("[data-href],[to],[routerlink]")) {
      const href = el.getAttribute("data-href") || el.getAttribute("to") || el.getAttribute("routerlink");
      if (href && href.startsWith("/")) links.add(origin + href.split("#")[0]);
    }
    return [...links].filter(Boolean);
  }, origin);
}

// click nav/sidebar items to reveal more routes
async function clickNavItems() {
  const navSelectors = [
    "nav a", "aside a", "[role='navigation'] a",
    ".sidebar a", ".menu a", ".nav a",
    "[class*='nav'] a", "[class*='sidebar'] a", "[class*='menu'] a"
  ];
  for (const sel of navSelectors) {
    const items = await page.locator(sel).all();
    for (const item of items) {
      try {
        const href = await item.getAttribute("href");
        if (href && !href.startsWith("http") === false && !href.startsWith(origin)) continue;
        const text = await item.innerText().catch(() => "");
        console.log("Nav item: " + text.trim() + " -> " + href);
        if (href) toVisit.push(href.startsWith("/") ? origin + href : href);
      } catch {}
    }
  }
}

// seed from nav first
await waitForApp();
await clickNavItems();

while (toVisit.length > 0) {
  const url = toVisit.shift();
  const cleanUrl = url.split("#")[0];
  if (visited.has(cleanUrl)) continue;
  visited.add(cleanUrl);

  try {
    const response = await page.goto(cleanUrl, { waitUntil: "domcontentloaded" });
    const status = response ? response.status() : "unknown";

    await waitForApp();

    if (status >= 400) {
      errors.push({ url: cleanUrl, error: "HTTP " + status });
      console.log("HTTP ERROR " + status + " on " + cleanUrl);
    }

    // check for error messages visible on the page
    const pageErrors = await page.evaluate(() => {
      const errorEls = document.querySelectorAll(
        "[class*='error']:not(script), [class*='alert']:not(script), [role='alert']"
      );
      return [...errorEls].map(el => el.innerText?.trim()).filter(t => t && t.length > 0);
    });
    if (pageErrors.length > 0) {
      errors.push({ url: cleanUrl, error: "UI error on page: " + pageErrors.join(" | ") });
      console.log("UI ERROR on " + cleanUrl + ": " + pageErrors.join(" | "));
    }

    await saveScreenshot(await page.screenshot({ fullPage: true }), "page-" + Date.now() + ".png");
    console.log("Visited: " + cleanUrl + " [" + status + "]");

    // collect new links from this page
    const links = await collectLinks();
    for (const link of links) {
      if (!visited.has(link)) toVisit.push(link);
    }
  } catch (err) {
    errors.push({ url: cleanUrl, error: String(err) });
    console.log("ERROR on " + cleanUrl + ": " + String(err));
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
