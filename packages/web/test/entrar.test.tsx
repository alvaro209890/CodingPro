import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Entrar } from "../src/ui/paginas/Entrar.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Entrar — fluxo crítico (W6)", () => {
  it("envia e-mail/senha e chama aoEntrar em sucesso", async () => {
    const user = userEvent.setup();
    const aoEntrar = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            usuario: {
              admin: false,
              creditosMicro: 0,
              email: "a@b.com",
              id: 1,
              limiteMicro: 0,
              nome: "A",
              status: "ativo",
            },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    );

    render(<Entrar aoEntrar={aoEntrar} destino="/painel" />);

    await user.type(screen.getByLabelText(/e-mail/i), "a@b.com");
    await user.type(screen.getByLabelText(/^senha$/i), "senha-segura");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    await vi.waitFor(() => expect(aoEntrar).toHaveBeenCalledOnce());
  });

  it("mostra aviso de erro quando a API recusa", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ erro: "credenciais", mensagem: "Senha incorreta." }), {
          status: 401,
        }),
      ),
    );

    render(<Entrar aoEntrar={() => {}} destino="/painel" />);
    await user.type(screen.getByLabelText(/e-mail/i), "a@b.com");
    await user.type(screen.getByLabelText(/^senha$/i), "errada");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByText(/senha incorreta/i)).toBeInTheDocument();
  });
});
