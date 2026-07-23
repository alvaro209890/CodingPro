import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: ["src/servidor.ts"],
  format: ["esm"],
  platform: "node",
  sourcemap: true,
  target: "node24",
});
