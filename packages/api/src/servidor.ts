import { criarApp } from "./app.js";
import { carregarConfig } from "./config.js";

/** Entrypoint do serviço `codingpro-api` (systemd user unit). */
async function principal(): Promise<void> {
  const config = carregarConfig();
  const app = criarApp(config);

  for (const sinal of ["SIGINT", "SIGTERM"] as const) {
    process.on(sinal, () => {
      app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  await app.listen({ host: config.host, port: config.porta });
}

principal().catch((erro: unknown) => {
  console.error("Falha ao subir a API do CodingPro:", erro);
  process.exit(1);
});
