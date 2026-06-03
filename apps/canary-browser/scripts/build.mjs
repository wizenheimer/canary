#!/usr/bin/env node
import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Build entry: bundles src/cli.ts into dist/cli.js with esbuild.
// Daemon bundles and SKILL.md are embedded as strings via the `text` loader
// (parity with Rust `include_str!`).
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");

await mkdir(dist, { recursive: true });

const common = {
  entryPoints: [resolve(root, "src/cli.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  legalComments: "none",
  loader: {},
  external: [],
  logLevel: "info",
};

// ESM bundle — npm-published artifact. Banner gives the bundled module a
// real CJS-aware `require`, used by commander (CJS) when it loads node:*
// builtins via dynamic require.
const esm = build({
  ...common,
  outfile: resolve(dist, "cli.js"),
  format: "esm",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  sourcemap: true,
});

// CJS variant for Node SEA — `--experimental-sea-config` only accepts CJS.
// `import.meta.url` isn't available in CJS, so map it to the equivalent derived
// from `__filename` (used by cli's isMain guard).
const cjs = build({
  ...common,
  outfile: resolve(dist, "cli.cjs"),
  format: "cjs",
  define: {
    "import.meta.url": "__importMetaUrl",
  },
  banner: {
    js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  sourcemap: false,
});

await Promise.all([esm, cjs]);
await chmod(resolve(dist, "cli.js"), 0o755);
