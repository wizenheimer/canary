const TARGET = "ci-portal.infobloxcloud.com";
const pages = await browser.listPages();
const appTab = pages.find(p => p.url && p.url.includes(TARGET));
if (!appTab) throw new Error("Tab not found: " + TARGET);
const page = await browser.getPage(appTab.id);
console.log("Attached to: " + appTab.url);

await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);

const visited = new Set();
const errors = [];
const toVisit = new Set();

const navCount = await page.locator("nav button[aria-haspopup='menu']").count();
console.log("Found " + navCount + " nav menus");

for (let menuIdx = 0; menuIdx < navCount; menuIdx++) {
  await page.locator("nav button[aria-haspopup='menu']").nth(menuIdx).click();
  await page.waitForTimeout(800);

  const itemCount = await page.locator("[role='menuitem']").count();
  const menuName = (await page.locator("nav button[aria-haspopup='menu']").nth(menuIdx).innerText()).trim();
  console.log("Menu: " + menuName + " has " + itemCount + " items");

  for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
    await page.goto("https://ci-portal.infobloxcloud.com/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.locator("nav button[aria-haspopup='menu']").nth(menuIdx).click();
    await page.waitForTimeout(800);

    const item = page.locator("[role='menuitem']").nth(itemIdx);
    const label = (await item.innerText().catch(() => "?")).trim();
    await item.click();
    await page.waitForTimeout(1500);

    const url = page.url();
    console.log("  " + label + " -> " + url);
    if (url && url.includes("ci-portal.infobloxcloud.com")) toVisit.add(url);
  }
}

await page.goto("https://ci-portal.infobloxcloud.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const anchorLinks = await page.evaluate(() => {
  const origin = "https://ci-portal.infobloxcloud.com";
  return [...document.querySelectorAll("a[href]")]
    .map(a => {
      try {
        const u = new URL(a.getAttribute("href"), origin);
        return u.origin === origin && !u.hash ? u.origin + u.pathname : null;
      } catch { return null; }
    })
    .filter(Boolean);
});
for (const l of anchorLinks) toVisit.add(l);

console.log("Total pages to visit: " + toVisit.size);
console.log(JSON.stringify([...toVisit], null, 2));

for (const url of toVisit) {
  if (visited.has(url)) continue;
  visited.add(url);
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    const status = response ? response.status() : "unknown";
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);

    if (status >= 400) {
      errors.push({ url, error: "HTTP " + status });
      console.log("HTTP ERROR " + status + " on " + url);
    }

    const pageErrors = await page.evaluate(() => {
      return [...document.querySelectorAll("[class*='error']:not(script),[role='alert']")]
        .map(el => el.innerText?.trim()).filter(t => t && t.length > 2);
    });
    if (pageErrors.length > 0) {
      errors.push({ url, error: "UI error: " + pageErrors.join(" | ") });
      console.log("UI ERROR on " + url + ": " + pageErrors.join(" | "));
    }

    await saveScreenshot(await page.screenshot({ fullPage: true }), "page-" + Date.now() + ".png");
    console.log("Visited: " + url + " [" + status + "]");
  } catch (err) {
    errors.push({ url, error: String(err) });
    console.log("ERROR on " + url + ": " + String(err));
  }
}

await writeFile("errors.json", JSON.stringify(errors, null, 2));
console.log("===========================");
console.log("Done. Visited: " + visited.size + " pages. Errors: " + errors.length);
if (errors.length > 0) for (const e of errors) console.log("  - [" + e.url + "] " + e.error);
