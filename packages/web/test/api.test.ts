import { afterEach, describe, expect, it, vi } from "vitest";
import { API_TIMEOUT_MS, api, type ErroApi } from "../src/ui/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cliente HTTP resiliente (W1)", () => {
  it("faz GET com credentials include e devolve JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get<{ ok: boolean }>("/api/eu")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("mapeia status HTTP para mensagem amigável", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(api.get("/api/x")).rejects.toMatchObject({
      codigo: "desconhecido",
      message: expect.stringMatching(/servidor falhou/i),
      status: 503,
    } satisfies Partial<ErroApi>);
  });

  it("faz 1 retry em falha de rede e depois sucede", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get<{ ok: boolean }>("/api/eu")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não faz retry em erro HTTP 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ erro: "nao_autorizado", mensagem: "Entre de novo." }), {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/api/eu")).rejects.toMatchObject({
      codigo: "nao_autorizado",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("expõe timeout padrão de 15 s", () => {
    expect(API_TIMEOUT_MS).toBe(15_000);
  });
});
