import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 15_000,
    pool: "forks",
  },
});
