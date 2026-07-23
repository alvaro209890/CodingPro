import postgres from "postgres";
import { MIGRACOES } from "./migracoes.js";

export type Sql = postgres.Sql<{ bigint: number }>;

/**
 * Abre o pool. `max` baixo de propósito: este PC divide o Postgres com o Atlas.
 *
 * `int8` (bigint) vem como **número**, não string. Todo bigint deste schema — ids,
 * micro-dólares — cabe folgado em `Number.MAX_SAFE_INTEGER`, e o padrão string do
 * postgres.js faria comparações como `usuario.id === id` falharem em silêncio.
 */
export function conectar(url: string, max = 8, schema?: string): Sql {
  return postgres(url, {
    ...(schema === undefined ? {} : { connection: { search_path: schema } }),
    max,
    onnotice: () => {},
    types: {
      bigint: {
        from: [20],
        parse: (valor: string) => Number(valor),
        serialize: (valor: number) => String(valor),
        to: 20,
      },
    },
  });
}

/**
 * Aplica as migrations pendentes dentro de uma transação por migration.
 * Idempotente: rodar de novo não faz nada.
 */
export async function migrar(sql: Sql): Promise<readonly string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migracoes (
      id          text        PRIMARY KEY,
      aplicada_em timestamptz NOT NULL DEFAULT now()
    )
  `;

  const jaAplicadas = await sql<{ id: string }[]>`SELECT id FROM _migracoes`;
  const conhecidas = new Set(jaAplicadas.map((linha) => linha.id));
  const aplicadas: string[] = [];

  for (const migracao of MIGRACOES) {
    if (conhecidas.has(migracao.id)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(migracao.sql);
      await tx`INSERT INTO _migracoes (id) VALUES (${migracao.id})`;
    });
    aplicadas.push(migracao.id);
  }

  return aplicadas;
}
