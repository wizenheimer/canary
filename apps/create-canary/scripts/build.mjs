#!/usr/bin/env node
// Bundle src/cli.tsx into dist/cli.js (ESM) with esbuild. React/Ink are inlined.
// The createRequire banner lets the bundle's CJS sub-deps (react/jsx-runtime,
// yoga-layout) resolve their dynamic requires, exactly like the other CLIs.
import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/cli.tsx")],
  outfile: resolve(dist, "cli.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "react",
  legalComments: "none",
  external: [],
  // ink statically imports react-devtools-core (its DEV-only devtools client).
  // We never run ink's dev path, so stub it to a harmless no-op rather than pull
  // the whole devtools package into the bundle.
  plugins: [
    {
      name: "stub-react-devtools-core",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: "react-devtools-core",
          namespace: "stub-devtools",
        }));
        pluginBuild.onLoad(
          { filter: /.*/, namespace: "stub-devtools" },
          () => ({
            contents:
              "const noop = () => {};\nexport default new Proxy(noop, { get: () => noop });",
            loader: "js",
          })
        );
      },
    },
  ],
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});

await chmod(resolve(dist, "cli.js"), 0o755);
