// @ts-check

import path from "node:path";
import { fileURLToPath } from "node:url";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundle-everything is a BUILD-time setting: it makes dist/server/entry.mjs
// fully self-contained (no runtime node_modules in the published package). In
// dev it must stay off — vite's dev module-runner would then evaluate CJS deps
// (e.g. astro's `cookie`) inline and crash with "exports is not defined".
const isDev = process.argv.includes("dev");

// The viewer is a server-rendered shell around two client-only React islands
// (Library, SessionView) plus the /api/* endpoints. `mode: "standalone"` emits
// a runnable dist/server/entry.mjs that also serves dist/client/ static assets,
// and `ssr.noExternal: true` bundles every server dep into that entry so the
// published package needs no runtime node_modules at all (the pure-JS fs code
// in src/lib has no native deps).
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    ssr: isDev ? undefined : { noExternal: true },
    resolve: {
      alias: { "@": path.join(dirname, "src") },
    },
  },
});
