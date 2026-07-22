import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: ["@ai-sdk/openai-compatible", "ai", "commander", /^jsonc-parser(?:\/|$)/u],
    onlyBundle: false,
  },
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
