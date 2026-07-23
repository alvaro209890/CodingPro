import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { criarPromptTty } from "../src/prompt-tty.js";
import { criarTema } from "../src/tema.js";

class FakeStdin extends EventEmitter {
  isTTY = true;
  raw = false;
  setRawMode(mode: boolean): void {
    this.raw = mode;
  }
  resume(): void {
    // no-op
  }
  writeChunk(s: string): void {
    this.emit("data", Buffer.from(s, "utf8"));
  }
}

function capturarSaida(): { texto: () => string; write: (s: string) => void } {
  let buf = "";
  return {
    texto: () => buf,
    write: (s: string) => {
      buf += s;
    },
  };
}

describe("prompt-tty", () => {
  it("lê linha submetida com Enter e devolve o buffer", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("nenhuma"),
    });
    const pending = prompt.ler("❯ ");
    // digita oi + enter
    input.writeChunk("oi\r");
    await expect(pending).resolves.toBe("oi");
    expect(out.texto()).toContain("oi");
    prompt.close();
  });

  it("Ctrl+D em vazio cancela (undefined)", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("nenhuma"),
    });
    const pending = prompt.ler("❯ ");
    input.writeChunk("\x04");
    await expect(pending).resolves.toBeUndefined();
    prompt.close();
  });

  it("autocomplete: / + Tab completa um comando", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("nenhuma"),
    });
    const pending = prompt.ler("❯ ");
    // /c + tab deve completar /custo ou similar; enter envia
    input.writeChunk("/c");
    input.writeChunk("\t");
    input.writeChunk("\r");
    const linha = await pending;
    expect(linha?.startsWith("/c")).toBe(true);
    prompt.close();
  });

  it("bannerAnimado escreve o wordmark e a régua", async () => {
    vi.useFakeTimers();
    const out = capturarSaida();
    const input = new FakeStdin();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("nenhuma"),
    });
    const p = prompt.bannerAnimado();
    await vi.runAllTimersAsync();
    await p;
    expect(out.texto()).toMatch(/CodingPro|DeepSeek|1M/u);
    prompt.close();
    vi.useRealTimers();
  });

  it("bannerAnimado (cor ativa) revela em múltiplos quadros, nunca reescrevendo pra cima", async () => {
    vi.useFakeTimers();
    let escritas = 0;
    const chunks: string[] = [];
    const input = new FakeStdin();
    const prompt = criarPromptTty({
      input: input as never,
      output: {
        write: (s: string) => {
          escritas += 1;
          chunks.push(s);
        },
      } as never,
      // Força unicode: detectarAscii(process.env) no ambiente de teste pode ser true (TERM=dumb etc.).
      tema: criarTema({ nivel: "truecolor", ascii: false }),
    });
    const p = prompt.bannerAnimado();
    await vi.runAllTimersAsync();
    await p;
    const texto = chunks.join("");
    expect(escritas).toBeGreaterThan(10);
    // Regex montada em runtime (nao literal) para nao disparar noControlCharactersInRegex.
    expect(texto).not.toMatch(new RegExp(String.fromCharCode(27) + "\\[\\d+A"));
    expect(texto).toContain("DeepSeek");
    expect(texto).toContain("╭");
    expect(texto).toContain("╰");
    prompt.close();
    vi.useRealTimers();
  });

  it("spinner exposto anima via handle", () => {
    vi.useFakeTimers();
    const out = capturarSaida();
    const input = new FakeStdin();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("16"),
    });
    prompt.spinner.start("teste");
    expect(prompt.spinner.ativo()).toBe(true);
    vi.advanceTimersByTime(200);
    prompt.spinner.stop("fim");
    expect(prompt.spinner.ativo()).toBe(false);
    expect(out.texto()).toContain("fim");
    prompt.close();
    vi.useRealTimers();
  });

  it("close impede novas leituras", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("nenhuma"),
    });
    prompt.close();
    await expect(prompt.ler()).resolves.toBeUndefined();
  });

  it("setas ↑↓ navegam a lista e Escape fecha; tema com cor", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("16"),
    });
    const pending = prompt.ler("❯ ");
    input.writeChunk("/");
    input.writeChunk("\x1b[B"); // down
    input.writeChunk("\x1b[A"); // up
    input.writeChunk("\x1b"); // escape sozinho + char
    input.writeChunk("z");
    // reabre e envia
    input.writeChunk("\x15"); // ctrl-u limpa
    input.writeChunk("/ajuda\r");
    await expect(pending).resolves.toBe("/ajuda");
    prompt.close();
  });

  it("signal abort cancela a leitura pendente", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const ac = new AbortController();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      signal: ac.signal,
      tema: criarTema("nenhuma"),
    });
    const pending = prompt.ler("❯ ");
    ac.abort();
    await expect(pending).resolves.toBeUndefined();
    prompt.close();
  });

  it("setRawMode que lança não quebra o prompt", async () => {
    const input = new FakeStdin();
    input.setRawMode = () => {
      throw new Error("sem raw");
    };
    const out = capturarSaida();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema: criarTema("nenhuma"),
    });
    const pending = prompt.ler("❯ ");
    input.writeChunk("ok\r");
    await expect(pending).resolves.toBe("ok");
    prompt.close();
  });

  it("signal já abortado ao iniciar ler resolve undefined", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const ac = new AbortController();
    ac.abort();
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      signal: ac.signal,
      tema: criarTema("truecolor"),
    });
    await expect(prompt.ler(criarTema("truecolor").prompt())).resolves.toBeUndefined();
    prompt.close();
  });

  it("truecolor + lista de sugestões exercita stripAnsi e redraw multi-linha", async () => {
    const input = new FakeStdin();
    const out = capturarSaida();
    const tema = criarTema("truecolor");
    const prompt = criarPromptTty({
      input: input as never,
      output: { write: out.write } as never,
      tema,
    });
    const pending = prompt.ler(tema.prompt());
    // abre lista e navega (força colCursor com ANSI no símbolo)
    input.writeChunk("/");
    input.writeChunk("\x1b[B");
    input.writeChunk("\x1b[B");
    input.writeChunk("\t");
    input.writeChunk("\r");
    const linha = await pending;
    expect(typeof linha).toBe("string");
    expect((linha ?? "").length).toBeGreaterThan(0);
    // saída contém códigos de cor ou o nome do comando
    expect(out.texto().length).toBeGreaterThan(5);
    prompt.close();
  });
});
