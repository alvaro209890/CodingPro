import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: ["commander"],
    onlyBundle: ["commander"],
  },
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
