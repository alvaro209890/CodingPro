import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: ".",
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
  server: {
    port: 5173,
    strictPort: true,
  },
});
