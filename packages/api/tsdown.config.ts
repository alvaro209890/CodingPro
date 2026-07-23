import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/servidor.ts"],
  format: ["esm"],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
