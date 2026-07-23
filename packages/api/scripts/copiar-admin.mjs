import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copia o build do painel admin para dentro de `dist/admin`, que é a pasta
 * servida por `@fastify/static` em `/admin`. Mantém a API auto-contida:
 * subir a API é suficiente, não há um segundo processo para o painel.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "..", "admin", "dist");
const destino = join(raiz, "dist", "admin");

const existe = await stat(origem).catch(() => null);
if (!existe) {
  console.warn(
    `painel admin não encontrado em ${origem} — rode 'pnpm --filter @codingpro/admin build' antes`,
  );
  process.exit(0);
}

await rm(destino, { force: true, recursive: true });
await mkdir(destino, { recursive: true });
await cp(origem, destino, { recursive: true });
console.log(`painel admin copiado para ${destino}`);
