import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// The monorepo root is two levels up from apps/canary-ui. Next must trace from
// here so pnpm's symlinked / hoisted deps are followed into the standalone
// bundle — otherwise the spawned server crashes with missing modules.
const monorepoRoot = path.join(dirname, "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server (server.js + a traced node_modules subset) the
  // `canary ui` command can spawn with plain `node`.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
};

export default nextConfig;
