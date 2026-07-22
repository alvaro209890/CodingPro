const VARIAVEL_AUTORIZACAO = "CODINGPRO_REAL_SMOKE";
const VALORES_INATIVOS = new Set(["", "0", "false", "no", "off"]);

function ambienteAtivo(valor) {
  return valor !== undefined && !VALORES_INATIVOS.has(valor.trim().toLowerCase());
}

if (process.env[VARIAVEL_AUTORIZACAO] !== "1") {
  process.stderr.write(
    `Smoke DeepSeek recusado: defina ${VARIAVEL_AUTORIZACAO}=1 explicitamente.\n`,
  );
  process.exitCode = 1;
} else if (ambienteAtivo(process.env.CI) || ambienteAtivo(process.env.GITHUB_ACTIONS)) {
  process.stderr.write("Smoke DeepSeek recusado dentro de CI.\n");
  process.exitCode = 1;
} else if (process.env.DEEPSEEK_API_KEY === undefined) {
  process.stderr.write("Smoke DeepSeek recusado: DEEPSEEK_API_KEY não está definida.\n");
  process.exitCode = 1;
} else {
  try {
    const { DeepSeekProvider } = await import("../packages/llm/dist/index.mjs");
    const provider = new DeepSeekProvider({
      apiKey: process.env.DEEPSEEK_API_KEY,
      chunkTimeoutMs: 10_000,
      maxOutputTokens: 16,
      thinking: false,
      totalTimeoutMs: 30_000,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    timeout.unref();

    let content = "";
    let finishes = 0;
    let usageOk = false;
    try {
      for await (const event of provider.stream(
        {
          messages: [
            {
              content: "Responda somente com as duas letras ASCII maiúsculas: OK",
              role: "user",
            },
          ],
        },
        { signal: controller.signal },
      )) {
        if (event.type === "text-delta") {
          content += event.text;
        } else if (event.type === "finish") {
          finishes += 1;
          usageOk =
            event.usage !== undefined &&
            event.usage.inputTokens >= 0 &&
            event.usage.outputTokens >= 0;
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    if (content.trim() !== "OK" || finishes !== 1 || !usageOk) {
      throw new Error("resultado inesperado");
    }
    process.stdout.write("Smoke DeepSeek aprovado.\n");
  } catch {
    process.stderr.write("Smoke DeepSeek reprovado.\n");
    process.exitCode = 1;
  }
}
