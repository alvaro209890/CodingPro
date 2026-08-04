/** Smoke mínimo do mesmo caminho Cloud usado pelo desktop empacotado. Nunca imprime o token. */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DeepSeekProvider } from "@codingpro/llm";

const credentialPath = join(homedir(), ".codingpro", "credenciais.json");
if (!existsSync(credentialPath)) {
  console.log("SMOKE_CLOUD_SKIP sem credenciais");
  process.exit(0);
}

try {
  const credential = JSON.parse(readFileSync(credentialPath, "utf8"));
  if (typeof credential.token !== "string" || !credential.token.startsWith("cp_")) {
    throw new Error("credencial Cloud inválida");
  }
  const apiUrl = new URL(
    typeof credential.apiUrl === "string"
      ? credential.apiUrl
      : "https://codingpro-api.cursar.space",
  );
  if (apiUrl.protocol !== "https:") throw new Error("API Cloud precisa usar HTTPS");

  let saldoHeader = false;
  let text = "";
  let finished = false;
  const provider = new DeepSeekProvider({
    aoReceberResposta(headers) {
      saldoHeader = /^\d+$/u.test(headers.get("x-codingpro-creditos-micro") ?? "");
    },
    apiKey: credential.token,
    baseUrl: `${apiUrl.toString().replace(/\/+$/u, "")}/v1`,
    chunkTimeoutMs: 30_000,
    maxOutputTokens: 32,
    thinking: false,
    totalTimeoutMs: 60_000,
  });

  for await (const event of provider.stream({
    messages: [{ content: "Responda somente: OK", role: "user" }],
  })) {
    if (event.type === "text-delta") text += event.text;
    if (event.type === "finish") finished = true;
  }

  if (!finished || !text.toUpperCase().includes("OK")) throw new Error("resposta Cloud incompleta");
  if (!saldoHeader) throw new Error("header de saldo ausente");
  console.log("SMOKE_CLOUD_OK saldo_header=ok");
} catch (error) {
  console.error("SMOKE_CLOUD_FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
