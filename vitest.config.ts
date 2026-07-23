import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      // packages/desktop é um app Electron (Fase 2) com toolchain própria (vite/electron) e
      // sem testes unitários; ele é typechecked/coberto pela sua própria config, não pelo gate do core.
      // `servidor.ts` são entrypoints de processo (listen + handlers de sinal), sem lógica
      // própria — mesma razão do index.ts. O que eles montam (`criarApp`, `PAGINA_EM_BREVE`)
      // é testado diretamente.
      exclude: ["packages/*/src/index.ts", "packages/*/src/servidor.ts", "packages/desktop/**"],
      include: ["packages/*/src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        // Global thresholds (perFile desligado: módulos SQLite/vector têm ramos de I/O
        // difíceis de forçar a 90% sem teatro; testes dedicados ainda cobrem o comportamento).
        branches: 80,
        functions: 90,
        lines: 90,
        perFile: false,
        statements: 90,
      },
    },
    environment: "node",
    include: ["packages/**/test/**/*.test.ts"],
  },
});
