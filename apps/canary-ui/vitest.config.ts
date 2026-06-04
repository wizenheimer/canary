import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the "@" -> src alias from tsconfig.json + astro.config.mjs.
    alias: { "@": path.join(dirname, "src") },
  },
  test: {
    include: ["src/lib/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 15_000,
    pool: "forks",
  },
});
