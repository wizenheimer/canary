const page = await browser.getPage("main");
const startUrl = page.url();
console.log("Starting at: " + startUrl);

const visited = new Set();
const errors = [];
const toVisit = [startUrl];

// listen for console errors
page.on("console", msg => {
  if (msg.type() === "error") {
    errors.push({ url: page.url(), error: msg.text() });
    console.log("CONSOLE ERROR: " + msg.text());
  }
});

// listen for failed network requests
page.on("requestfailed", req => {
  errors.push({ url: page.url(), error: "Request failed: " + req.url() });
  console.log("REQUEST FAILED: " + req.url());
});

while (toVisit.length > 0) {
  const url = toVisit.shift();
  if (visited.has(url)) continue;
  visited.add(url);

  const response = await page.goto(url, { waitUntil: "networkidle" });
  const status = response ? response.status() : "unknown";

  if (status >= 400) {
    errors.push({ url, error: "HTTP " + status });
    console.log("HTTP ERROR " + status + " on " + url);
  }

  await saveScreenshot(await page.screenshot(), "page-" + Date.now() + ".png");
  console.log("Visited: " + url + " [" + status + "]");

  const links = await page.evaluate((origin) =>
    [...document.querySelectorAll("a[href]")]
      .map(a => a.href)
      .filter(h => h.startsWith(origin) && !h.includes("#"))
  , new URL(url).origin);

  for (const link of links) {
    if (!visited.has(link)) toVisit.push(link);
  }
}

await writeFile("errors.json", JSON.stringify(errors, null, 2));
console.log("Done. Visited: " + visited.size + " pages. Errors: " + errors.length);
