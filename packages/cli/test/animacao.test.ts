import { afterEach, describe, expect, it, vi } from "vitest";
import {
  criarSpinner,
  frameFaisca,
  framePontos,
  framePulso,
  frameSpinner,
  framesBannerAbertura,
  linhaSpinner,
  PONTOS_FRAMES,
  PULSO_FRAMES,
  SPINNER_FRAMES,
} from "../src/animacao.js";

describe("animacao", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("frames ciclam em todos os conjuntos", () => {
    expect(frameSpinner(0)).toBe(SPINNER_FRAMES[0]);
    expect(frameSpinner(SPINNER_FRAMES.length)).toBe(SPINNER_FRAMES[0]);
    expect(frameSpinner(-1)).toBe(SPINNER_FRAMES[SPINNER_FRAMES.length - 1]);
    expect(framePontos(0)).toBe(PONTOS_FRAMES[0]);
    expect(framePontos(PONTOS_FRAMES.length + 1)).toBe(PONTOS_FRAMES[1]);
    expect(framePulso(0)).toBe(PULSO_FRAMES[0]);
    expect(frameFaisca(0).length).toBeGreaterThan(0);
    expect(linhaSpinner(0, "oi")).toContain("oi");
    expect(framesBannerAbertura(0)).toContain("CodingPro");
    expect(framesBannerAbertura(3)).toContain("╭");
  });

  it("criarSpinner anima, atualiza e limpa ao parar", () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const sp = criarSpinner((t) => chunks.push(t), 50);
    expect(sp.ativo()).toBe(false);
    sp.start("pensando");
    expect(sp.ativo()).toBe(true);
    expect(chunks.some((c) => c.includes("pensando"))).toBe(true);
    // start de novo é no-op
    sp.start("outro");
    expect(sp.ativo()).toBe(true);
    vi.advanceTimersByTime(160);
    expect(chunks.length).toBeGreaterThan(2);
    sp.update("lendo");
    expect(chunks.at(-1)).toContain("lendo");
    sp.stop("✓ feito");
    expect(sp.ativo()).toBe(false);
    expect(chunks.join("")).toContain("feito");
    // stop de novo com mensagem
    const n = chunks.length;
    sp.stop("já parado");
    expect(chunks.length).toBeGreaterThan(n);
    expect(chunks.join("")).toContain("já parado");
  });

  it("stop sem start e stop vazio não rebentam", () => {
    const chunks: string[] = [];
    const sp = criarSpinner((t) => chunks.push(t), 30);
    sp.stop();
    expect(sp.ativo()).toBe(false);
    sp.start("x");
    sp.stop("");
    expect(sp.ativo()).toBe(false);
  });
});
