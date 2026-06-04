const page = await browser.getPage("main");
const snap = await page.snapshotForAI(); // { full, incremental? }
console.log(page.url(), await page.title());
console.log(snap.full); // aria outline — pick a role/text selector from this
// then act: await page.getByRole("button", { name: "Continue" }).click();
// after changes, page.snapshotForAI({ track: "main" }) returns just the incremental diff
