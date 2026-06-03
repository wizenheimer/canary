// Next's `output: "standalone"` build deliberately omits `.next/static` and
// `public/` (it assumes a CDN serves them). For a self-spawned local server we
// must copy them into the standalone tree, next to the generated server.js.
//
// With outputFileTracingRoot = monorepo root, the workspace path is mirrored
// under standalone/, so server.js lands at:
//   .next/standalone/apps/canary-ui/server.js
import { access, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(dirname, "..");
const standaloneApp = path.join(
  appDir,
  ".next",
  "standalone",
  "apps",
  "canary-ui"
);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyInto(srcRel, dstAbs, label) {
  const src = path.join(appDir, srcRel);
  if (!(await exists(src))) {
    return;
  }
  await cp(src, dstAbs, { recursive: true });
  process.stdout.write(`postbuild: copied ${label}\n`);
}

async function main() {
  await copyInto(
    path.join(".next", "static"),
    path.join(standaloneApp, ".next", "static"),
    ".next/static"
  );
  await copyInto("public", path.join(standaloneApp, "public"), "public");
}

main().catch((err) => {
  process.stderr.write(`postbuild failed: ${err?.message ?? err}\n`);
  process.exitCode = 1;
});
