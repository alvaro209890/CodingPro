import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["packages/*/src/index.ts"],
      include: ["packages/*/src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 80,
        functions: 90,
        lines: 90,
        perFile: true,
        statements: 90,
      },
    },
    environment: "node",
    include: ["packages/**/test/**/*.test.ts"],
  },
});
