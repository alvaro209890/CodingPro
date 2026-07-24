import type { FastifyInstance } from "fastify";
import type { ConfigApi } from "../config.js";

export function registrarRotasPublicas(app: FastifyInstance, config: ConfigApi): void {
  app.get("/api/publico/config", async () => ({
    siteUrl: config.siteUrl,
    turnstileSiteKey: config.turnstileSiteKey || null,
  }));
}
