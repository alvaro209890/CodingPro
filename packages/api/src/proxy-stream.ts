import { LeitorDeUso, normalizarUso, type UsoNormalizado } from "./proxy.js";

export type ProxyStreamError = "cliente_desconectado" | "stream_interrompido" | null;

export interface ProxyStreamSummary {
  readonly erro: ProxyStreamError;
  readonly uso: UsoNormalizado;
}

export interface ProxyStreamOptions {
  /** Só respostas não-streaming precisam guardar o corpo para o fallback JSON de usage. */
  readonly captureJsonBody: boolean;
  readonly clientSignal?: AbortSignal;
  readonly onFinish: (summary: ProxyStreamSummary) => void | Promise<void>;
}

/**
 * Repassa o upstream sem bufferizar SSE e cancela o reader quando o consumidor fecha cedo.
 * Isso impede que uma requisição abandonada continue gerando tokens no provedor.
 */
export async function* proxyUpstreamStream(
  fluxo: ReadableStream<Uint8Array>,
  options: ProxyStreamOptions,
): AsyncGenerator<Buffer> {
  const leitor = new LeitorDeUso();
  const decodificador = new TextDecoder();
  const pedacosJson: string[] = [];
  const reader = fluxo.getReader();
  let completed = false;
  let failed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (value !== undefined) {
        const texto = decodificador.decode(value, { stream: true });
        if (options.captureJsonBody) pedacosJson.push(texto);
        leitor.alimentar(texto);
        yield Buffer.from(value);
      }
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!completed) {
      await reader.cancel("consumidor desconectado").catch(() => undefined);
    }
    reader.releaseLock();
    const restante = decodificador.decode();
    if (restante.length > 0) {
      if (options.captureJsonBody) pedacosJson.push(restante);
      leitor.alimentar(restante);
    }
    leitor.alimentar("\n");

    let uso = normalizarUso(leitor.uso);
    if (
      options.captureJsonBody &&
      uso.tokensEntrada === 0 &&
      uso.tokensSaida === 0 &&
      uso.tokensRaciocinio === 0
    ) {
      try {
        const json = JSON.parse(pedacosJson.join("")) as { usage?: Record<string, unknown> };
        if (json.usage) uso = normalizarUso(json.usage);
      } catch {
        // Corpo não JSON ou incompleto: mantém uso zerado.
      }
    }

    await options.onFinish({
      erro: completed
        ? null
        : options.clientSignal?.aborted === true || !failed
          ? "cliente_desconectado"
          : "stream_interrompido",
      uso,
    });
  }
}
