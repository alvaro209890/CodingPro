import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base: /admin/` porque a SPA é servida pela API nesse prefixo (@fastify/static).
export default defineConfig({
  base: "/admin/",
  build: { outDir: "dist", sourcemap: false },
  plugins: [react()],
  server: { port: 5181 },
});
