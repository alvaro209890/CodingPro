import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { criarLeitorDeLinhas } from "../src/line-reader.js";

function saidaCapturada(): { escrito: () => string; stream: PassThrough } {
  const stream = new PassThrough();
  let escrito = "";
  stream.on("data", (chunk: Buffer) => {
    escrito += chunk.toString("utf8");
  });
  return { escrito: () => escrito, stream };
}

describe("criarLeitorDeLinhas", () => {
  it("lê linhas na ordem e resolve undefined no fim", async () => {
    const input = new PassThrough();
    const out = saidaCapturada();
    const leitor = criarLeitorDeLinhas(input, out.stream);
    input.write("alpha\n");
    input.write("beta\n");
    input.end();
    expect(await leitor.next("› ")).toBe("alpha");
    expect(await leitor.next("› ")).toBe("beta");
    expect(await leitor.next("› ")).toBeUndefined();
  });

  it("resolve mesmo com todo o input de uma vez e EOF imediato (o race antigo)", async () => {
    const input = new PassThrough();
    const leitor = criarLeitorDeLinhas(input, saidaCapturada().stream);
    input.end("um\ndois\ntres\n");
    expect(await leitor.next("› ")).toBe("um");
    expect(await leitor.next("› ")).toBe("dois");
    expect(await leitor.next("› ")).toBe("tres");
    expect(await leitor.next("› ")).toBeUndefined();
    expect(await leitor.next("› ")).toBeUndefined();
  });

  it("aguarda a próxima linha quando a fila está vazia e escreve o prompt", async () => {
    const input = new PassThrough();
    const out = saidaCapturada();
    const leitor = criarLeitorDeLinhas(input, out.stream);
    const pendente = leitor.next("pergunta: ");
    expect(out.escrito()).toBe("pergunta: ");
    input.write("resposta\n");
    expect(await pendente).toBe("resposta");
  });

  it("resolve undefined quando o stream fecha com uma leitura pendente", async () => {
    const input = new PassThrough();
    const leitor = criarLeitorDeLinhas(input, saidaCapturada().stream);
    const pendente = leitor.next("› ");
    input.end();
    expect(await pendente).toBeUndefined();
  });

  it("close encerra o leitor", async () => {
    const input = new PassThrough();
    const leitor = criarLeitorDeLinhas(input, saidaCapturada().stream);
    const pendente = leitor.next("› ");
    leitor.close();
    expect(await pendente).toBeUndefined();
  });
});
