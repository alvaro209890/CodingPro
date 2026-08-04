import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Usuario } from "../src/ui/api.js";
import { Painel } from "../src/ui/paginas/Painel.js";

const usuario: Usuario = {
  admin: false,
  creditosMicro: 5_000_000,
  email: "teste@codingpro.local",
  id: 1,
  limiteMicro: 10_000_000,
  nome: "Teste",
  status: "ativo",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${url}`;
      const handler = handlers[key] ?? handlers[url];
      if (!handler) throw new Error(`fetch sem stub: ${key}`);
      return handler();
    }),
  );
}

describe("Painel — consumo e dispositivos (W2/W3/W5/W6)", () => {
  beforeEach(() => {
    stubFetch({
      "GET /api/consumo": () =>
        new Response(
          JSON.stringify({
            cacheHitPercent: 72.5,
            creditosMicro: 5_000_000,
            custoMedioMicro: 1_250,
            custoMicro: 250_000,
            diario: [{ custoMicro: 10_000, dia: "2026-08-01" }],
            diasAteRenovar: 27,
            limiteMicro: 10_000_000,
            percentual: 2.5,
            requisicoes: 200,
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      "GET /api/tokens": () =>
        new Response(
          JSON.stringify({
            tokens: [
              {
                criadoEm: "2026-08-01T12:00:00.000Z",
                id: 9,
                nome: "PC-Escritorio",
                prefixo: "cp_abc",
                revogadoEm: null,
                ultimoUso: null,
              },
            ],
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      "DELETE /api/tokens/9": () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    });
  });

  it("mostra cache-hit % e custo médio na aba consumo", async () => {
    render(<Painel aoAtualizar={() => {}} usuario={usuario} />);

    await waitFor(() => {
      expect(screen.getByText("73%")).toBeInTheDocument();
    });
    expect(screen.getByText("Cache-hit")).toBeInTheDocument();
    expect(screen.getByText("Custo / requisição")).toBeInTheDocument();
    expect(screen.getByText("US$ 0.0013")).toBeInTheDocument();
  });

  it("oferece tentar novamente quando o consumo falha", async () => {
    const user = userEvent.setup();
    stubFetch({
      "GET /api/consumo": () =>
        new Response(JSON.stringify({ mensagem: "rede caiu", erro: "rede" }), {
          status: 503,
        }),
    });

    render(<Painel aoAtualizar={() => {}} usuario={usuario} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /tentar novamente/i })).toBeInTheDocument(),
    );

    stubFetch({
      "GET /api/consumo": () =>
        new Response(
          JSON.stringify({
            cacheHitPercent: 10,
            creditosMicro: 1,
            custoMedioMicro: 0,
            custoMicro: 0,
            diario: [],
            diasAteRenovar: 1,
            limiteMicro: 1,
            percentual: 0,
            requisicoes: 0,
          }),
          { status: 200 },
        ),
    });
    await user.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await waitFor(() => expect(screen.getByText("Cache-hit")).toBeInTheDocument());
  });

  it("pede confirmação inline antes de desconectar dispositivo", async () => {
    const user = userEvent.setup();
    let revogado = false;
    stubFetch({
      "GET /api/consumo": () =>
        new Response(
          JSON.stringify({
            cacheHitPercent: 0,
            creditosMicro: 1,
            custoMedioMicro: 0,
            custoMicro: 0,
            diario: [],
            diasAteRenovar: 1,
            limiteMicro: 1,
            percentual: 0,
            requisicoes: 0,
          }),
          { status: 200 },
        ),
      "GET /api/tokens": () =>
        new Response(
          JSON.stringify({
            tokens: revogado
              ? []
              : [
                  {
                    criadoEm: "2026-08-01T12:00:00.000Z",
                    id: 9,
                    nome: "PC-Escritorio",
                    prefixo: "cp_abc",
                    revogadoEm: null,
                    ultimoUso: null,
                  },
                ],
          }),
          { status: 200 },
        ),
      "DELETE /api/tokens/9": () => {
        revogado = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    render(<Painel aoAtualizar={() => {}} usuario={usuario} />);

    await user.click(screen.getByRole("tab", { name: /dispositivos/i }));
    await waitFor(() => expect(screen.getByText("PC-Escritorio")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^desconectar$/i }));
    expect(screen.getByText(/desconectar esta máquina/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^desconectar$/i }));
    await waitFor(() => {
      expect(screen.queryByText("PC-Escritorio")).not.toBeInTheDocument();
    });
  });
});
