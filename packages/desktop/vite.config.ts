import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Isolado de "dist/main" e "dist/preload" (saída do `tsc`) — do contrário
    // `emptyOutDir` apaga o main/preload compilados a cada `vite build`.
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
