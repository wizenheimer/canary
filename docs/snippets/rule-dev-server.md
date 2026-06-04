For local dev servers (Next.js, Vite, …) prefer
`await page.goto(url, { waitUntil: "domcontentloaded" })` — the default `"load"` wait can hang
on HMR, streaming, or other long-lived dev-server connections. Use `"load"` only when you
specifically need every subresource to finish loading.
