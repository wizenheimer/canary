const page = await browser.getPage("main");
await page.goto("https://ci-portal.infobloxcloud.com/", { waitUntil: "domcontentloaded" });
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

// normalize a href to a full URL, returns null if invalid or external
function resolveUrl(href) {
  if (!href) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

// collect all links after JS renders
async function collectLinks() {
  await waitForApp();
  return await page.evaluate((origin) => {
    const links = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      try {
        const url = new URL(a.getAttribute("href"), origin);
        if (url.origin === origin) links.add(url.origin + url.pathname);
      } catch {}
    }
    for (const el of document.querySelectorAll("[data-href],[to],[routerlink]")) {
      const href = el.getAttribute("data-href") || el.getAttribute("to") || el.getAttribute("routerlink");
      try {
        const url = new URL(href, origin);
        if (url.origin === origin) links.add(url.origin + url.pathname);
      } catch {}
    }
    return [...links];
  }, origin);
}

// click nav/sidebar items to seed routes
async function collectNavLinks() {
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
        const resolved = resolveUrl(href);
        if (!resolved) continue;
        const text = (await item.innerText().catch(() => "")).trim();
        console.log("Nav item: " + text + " -> " + resolved);
        toVisit.push(resolved);
      } catch {}
    }
  }
}

// seed from nav first
await waitForApp();
await collectNavLinks();

while (toVisit.length > 0) {
  const url = toVisit.shift();
  if (!url || visited.has(url)) continue;
  visited.add(url);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    const status = response ? response.status() : "unknown";

    await waitForApp();

    if (status >= 400) {
      errors.push({ url, error: "HTTP " + status });
      console.log("HTTP ERROR " + status + " on " + url);
    }

    // check for visible error messages on the page
    const pageErrors = await page.evaluate(() => {
      const errorEls = document.querySelectorAll(
        "[class*='error']:not(script), [class*='alert']:not(script), [role='alert']"
      );
      return [...errorEls].map(el => el.innerText?.trim()).filter(t => t && t.length > 0);
    });
    if (pageErrors.length > 0) {
      errors.push({ url, error: "UI error on page: " + pageErrors.join(" | ") });
      console.log("UI ERROR on " + url + ": " + pageErrors.join(" | "));
    }

    await saveScreenshot(await page.screenshot({ fullPage: true }), "page-" + Date.now() + ".png");
    console.log("Visited: " + url + " [" + status + "]");

    // collect new links from this page
    const links = await collectLinks();
    for (const link of links) {
      if (!visited.has(link)) toVisit.push(link);
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
