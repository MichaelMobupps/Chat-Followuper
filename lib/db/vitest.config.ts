import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // DB1: migrate the target DB to head before the suite runs so tests never
    // fail merely because the DB lags the schema.
    globalSetup: ["./src/test/globalSetup.ts"],
    testTimeout: 15000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
