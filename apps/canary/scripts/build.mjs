#!/usr/bin/env node
import { chmod, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Build entry: bundles src/cli.ts into dist/cli.js with esbuild.
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");

await mkdir(dist, { recursive: true });

// Inject the package version so `canary --version` reports it without reading
// package.json at runtime (the published bundle ships without an adjacent one).
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const common = {
  entryPoints: [resolve(root, "src/cli.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  legalComments: "none",
  loader: {},
  external: [],
  define: {
    "process.env.CANARY_CLI_VERSION": JSON.stringify(pkg.version),
  },
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
// from `__filename` (used by resolve-server's workspace walk + cli's isMain).
const cjs = build({
  ...common,
  outfile: resolve(dist, "cli.cjs"),
  format: "cjs",
  define: {
    ...common.define,
    "import.meta.url": "__importMetaUrl",
  },
  banner: {
    js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  sourcemap: false,
});

await Promise.all([esm, cjs]);
await chmod(resolve(dist, "cli.js"), 0o755);
