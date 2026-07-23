import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { criarApp } from "./app.js";
import { carregarConfig } from "./config.js";
import { conectar, migrar } from "./db/index.js";
import { criarRepositorio } from "./repositorio.js";

/** Entrypoint do serviço `codingpro-api` (systemd user unit). */
async function principal(): Promise<void> {
  const config = carregarConfig();
  const dirAdmin = join(dirname(fileURLToPath(import.meta.url)), "admin");

  let repo: ReturnType<typeof criarRepositorio> | undefined;
  let fecharBanco: (() => Promise<void>) | undefined;

  if (config.databaseUrl === "") {
    // Modo degradado em vez de crash: `/saude` continua respondendo e o tunnel não
    // fica devolvendo 502 enquanto o banco não é configurado.
    console.warn("DATABASE_URL não configurada — subindo em modo degradado (só /saude).");
  } else {
    const sql = conectar(config.databaseUrl);
    const aplicadas = await migrar(sql);
    if (aplicadas.length > 0) console.log(`migrations aplicadas: ${aplicadas.join(", ")}`);
    repo = criarRepositorio(sql);
    fecharBanco = async () => {
      await sql.end({ timeout: 5 });
    };
  }

  const app = await criarApp({ config, dirAdmin, ...(repo ? { repo } : {}) });

  for (const sinal of ["SIGINT", "SIGTERM"] as const) {
    process.on(sinal, () => {
      app
        .close()
        .then(async () => {
          await fecharBanco?.();
          process.exit(0);
        })
        .catch(() => process.exit(1));
    });
  }

  await app.listen({ host: config.host, port: config.porta });
}

principal().catch((erro: unknown) => {
  console.error("Falha ao subir a API do CodingPro:", erro);
  process.exit(1);
});
