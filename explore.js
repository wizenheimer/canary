const TARGET = "ci-portal.infobloxcloud.com";
const pages = await browser.listPages();
const appTab = pages.find(p => p.url && p.url.includes(TARGET));
if (!appTab) throw new Error("Tab not found: " + TARGET);
const page = await browser.getPage(appTab.id);
console.log("Attached to: " + appTab.url);

await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);

const results = [];
const errors = [];

async function checkPage(label, url) {
  await page.waitForTimeout(1500);
  const currentUrl = page.url();

  // take screenshot
  await saveScreenshot(await page.screenshot({ fullPage: true }), "page-" + Date.now() + ".png");

  // check for error states
  const state = await page.evaluate(() => {
    const body = document.body.innerText;

    // only flag visible text-based errors
    const errorKeywords = ["Something went wrong", "403 Forbidden", "404 Not Found", "Access denied", "Unauthorized", "You don't have permission"];
    const hasKeywordError = errorKeywords.some(k => body.includes(k));

    // only flag role=alert elements that have visible non-empty text
    const alertEls = [...document.querySelectorAll("[role='alert']")]
      .map(el => el.innerText?.trim())
      .filter(t => t && t.length > 5);

    const hasError = hasKeywordError || alertEls.length > 0;
    const errorText = alertEls.join(" | ") || (hasKeywordError ? errorKeywords.find(k => body.includes(k)) : "");
    const hasContent = document.querySelectorAll("main, [role='main'], .content, table, [class*='card']").length > 0;
    const title = document.title;
    return { hasError, errorText, hasContent, title, bodyPreview: body.slice(0, 200) };
  });

  const result = {
    menu: label,
    url: currentUrl,
    hasError: state.hasError,
    hasContent: state.hasContent,
    title: state.title,
    errorText: state.errorText,
    bodyPreview: state.bodyPreview
  };

  results.push(result);

  if (state.hasError) {
    errors.push({ label, url: currentUrl, error: state.errorText || "Error state detected" });
    console.log("ERROR on [" + label + "] " + currentUrl + ": " + (state.errorText || "error state detected"));
  } else if (!state.hasContent) {
    errors.push({ label, url: currentUrl, error: "Page appears empty — no main content found" });
    console.log("EMPTY on [" + label + "] " + currentUrl);
  } else {
    console.log("OK    [" + label + "] " + currentUrl + " | " + state.title);
  }
}

// navigate using menu clicks to preserve session
const navCount = await page.locator("nav button[aria-haspopup='menu']").count();
console.log("Found " + navCount + " nav menus\n");

for (let menuIdx = 0; menuIdx < navCount; menuIdx++) {
  const menuName = (await page.locator("nav button[aria-haspopup='menu']").nth(menuIdx).innerText()).trim();

  await page.goto("https://ci-portal.infobloxcloud.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.locator("nav button[aria-haspopup='menu']").nth(menuIdx).click();
  await page.waitForTimeout(800);

  const itemCount = await page.locator("[role='menuitem']").count();
  console.log("--- " + menuName + " (" + itemCount + " items) ---");

  for (let itemIdx = 0; itemIdx < itemCount; itemIdx++) {
    await page.goto("https://ci-portal.infobloxcloud.com/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.locator("nav button[aria-haspopup='menu']").nth(menuIdx).click();
    await page.waitForTimeout(800);

    const item = page.locator("[role='menuitem']").nth(itemIdx);
    const label = menuName + " > " + (await item.innerText().catch(() => "?")).trim();

    // click the menu item — let the app router navigate
    await item.click();
    await page.waitForTimeout(2000);

    await checkPage(label, page.url());
  }
}

// also check home and anchor-linked pages
await page.goto("https://ci-portal.infobloxcloud.com/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await checkPage("Home", page.url());

const anchorPages = await page.evaluate(() => {
  return [...document.querySelectorAll("a[href]")]
    .map(a => ({ text: a.innerText?.trim(), href: a.getAttribute("href") }))
    .filter(a => a.href && !a.href.startsWith("#") && !a.href.startsWith("http"));
});
for (const a of anchorPages) {
  await page.goto("https://ci-portal.infobloxcloud.com" + a.href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await checkPage("Link: " + a.text, page.url());
}

// save full report
await writeFile("report.json", JSON.stringify({ results, errors }, null, 2));

console.log("\n===========================");
console.log("Done. Visited: " + results.length + " pages.");
console.log("Issues found: " + errors.length);
if (errors.length > 0) {
  console.log("\nIssues:");
  for (const e of errors) console.log("  [" + e.label + "] " + e.url + "\n    -> " + e.error);
}
console.log("\nAll results saved to ~/.canary/tmp/report.json");
