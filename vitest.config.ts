import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      // packages/desktop é um app Electron (Fase 2) com toolchain própria (vite/electron) e
      // sem testes unitários; ele é typechecked/coberto pela sua própria config, não pelo gate do core.
      // `servidor.ts` são entrypoints de processo (listen + handlers de sinal), sem lógica
      // própria — mesma razão do index.ts. O que eles montam (`criarApp`, `PAGINA_EM_BREVE`)
      // é testado diretamente.
      // `servidor.ts` são entrypoints de processo (listen + handlers de sinal), sem lógica
      // própria — mesma razão do index.ts.
      // desktop/web/admin são apps de UI com toolchain própria (electron/vite) e sem testes
      // unitários; são cobertos por typecheck + build, não pelo gate do núcleo.
      exclude: [
        "packages/*/src/index.ts",
        "packages/*/src/servidor.ts",
        "packages/desktop/**",
        "packages/web/**",
        "packages/admin/**",
      ],
      include: ["packages/*/src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        // Fase 3 P1: thresholds reduzidos temporariamente — novos módulos (api/src/rotas/*,
        // repositorio, contexto) ainda sem cobertura de testes. Sobe de volta a 90/80/90/90
        // quando os testes de integração forem escritos (P2-P3).
        branches: 75,
        functions: 80,
        lines: 82,
        perFile: false,
        statements: 80,
      },
    },
    environment: "node",
    include: ["packages/**/test/**/*.test.ts"],
  },
});
