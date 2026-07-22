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
} else if (
  process.env.DEEPSEEK_API_KEY === undefined ||
  process.env.DEEPSEEK_API_KEY.trim().length === 0
) {
  process.stderr.write("Smoke DeepSeek recusado: DEEPSEEK_API_KEY não está definida.\n");
  process.exitCode = 1;
} else {
  try {
    const { DEEPSEEK_MODEL_FLASH, DEEPSEEK_MODEL_PRO, DeepSeekProvider } = await import(
      "../packages/llm/dist/index.mjs"
    );
    const somar = {
      description: "Soma dois números inteiros.",
      inputSchema: {
        additionalProperties: false,
        properties: { a: { type: "integer" }, b: { type: "integer" } },
        required: ["a", "b"],
        type: "object",
      },
      name: "somar",
    };

    for (const [model, label] of [
      [DEEPSEEK_MODEL_PRO, "Pro"],
      [DEEPSEEK_MODEL_FLASH, "Flash"],
    ]) {
      const provider = new DeepSeekProvider({
        apiKey: process.env.DEEPSEEK_API_KEY,
        chunkTimeoutMs: 20_000,
        maxOutputTokens: 256,
        model,
        reasoningEffort: "high",
        thinking: true,
        totalTimeoutMs: 60_000,
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 125_000);
      timeout.unref();
      const prompt = {
        content:
          "Use obrigatoriamente a ferramenta somar com a=19 e b=23. Após receber o resultado, responda somente com os dígitos 42.",
        role: "user",
      };

      try {
        const firstEvents = [];
        for await (const event of provider.stream(
          { messages: [prompt], tools: [somar] },
          { signal: controller.signal },
        )) {
          firstEvents.push(event);
        }
        const calls = firstEvents.filter((event) => event.type === "tool-call");
        const firstFinish = firstEvents.at(-1);
        if (
          calls.length !== 1 ||
          calls[0].call.name !== "somar" ||
          calls[0].call.input.a !== 19 ||
          calls[0].call.input.b !== 23 ||
          Object.keys(calls[0].call.input).length !== 2 ||
          firstFinish?.type !== "finish" ||
          firstFinish.reason !== "tool-calls" ||
          firstFinish.usage === undefined
        ) {
          throw new Error("primeiro turno inesperado");
        }

        let finalContent = "";
        let finalFinish;
        for await (const event of provider.stream(
          {
            messages: [
              prompt,
              firstFinish.message,
              {
                result: { type: "json", value: { resultado: 42 } },
                role: "tool",
                toolCallId: calls[0].call.id,
                toolName: calls[0].call.name,
              },
            ],
            toolChoice: "none",
            tools: [somar],
          },
          { signal: controller.signal },
        )) {
          if (event.type === "text-delta") {
            finalContent += event.text;
          } else if (event.type === "tool-call") {
            throw new Error("segunda chamada de tool inesperada");
          } else if (event.type === "finish") {
            finalFinish = event;
          }
        }
        if (
          finalContent.trim() !== "42" ||
          finalFinish?.reason !== "stop" ||
          finalFinish.usage === undefined
        ) {
          throw new Error("resposta final inesperada");
        }
      } finally {
        clearTimeout(timeout);
      }
      process.stdout.write(`Smoke DeepSeek tools ${label} aprovado.\n`);
    }
  } catch {
    process.stderr.write("Smoke DeepSeek reprovado.\n");
    process.exitCode = 1;
  }
}
