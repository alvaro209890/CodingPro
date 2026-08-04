import { describe, expect, it, vi } from "vitest";
import { proxyUpstreamStream, type ProxyStreamSummary } from "../src/proxy-stream.js";

describe("proxyUpstreamStream", () => {
  it("cancela o upstream e classifica quando o consumidor fecha antes do fim", async () => {
    const cancel = vi.fn();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const upstream = new ReadableStream<Uint8Array>({
      cancel,
      start(value) {
        controller = value;
        value.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'));
      },
    });
    let summary: ProxyStreamSummary | undefined;
    const generator = proxyUpstreamStream(upstream, {
      captureJsonBody: false,
      onFinish(value) {
        summary = value;
      },
    });

    await generator.next();
    await generator.return(undefined);

    expect(cancel).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ erro: "cliente_desconectado" });
    expect(() => controller.enqueue(new Uint8Array())).toThrow();
  });

  it("repassa até o fim, preserva usage e não cancela resposta completa", async () => {
    const cancel = vi.fn();
    const upstream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n',
          ),
        );
        controller.close();
      },
    });
    let summary: ProxyStreamSummary | undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of proxyUpstreamStream(upstream, {
      captureJsonBody: false,
      onFinish(value) {
        summary = value;
      },
    })) {
      chunks.push(chunk);
    }

    expect(Buffer.concat(chunks).toString("utf8")).toContain("prompt_tokens");
    expect(cancel).not.toHaveBeenCalled();
    expect(summary).toEqual({
      erro: null,
      uso: { tokensCache: 0, tokensEntrada: 12, tokensRaciocinio: 0, tokensSaida: 3 },
    });
  });
});
