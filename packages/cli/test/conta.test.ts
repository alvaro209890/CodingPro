import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apagarCredenciais,
  caminhoCredenciais,
  consultarDevice,
  fazerLogin,
  gravarCredenciais,
  iniciarDevice,
  lerCredenciais,
  verificarToken,
} from "../src/conta.js";

let home = "";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "codingpro-conta-"));
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("armazenamento de credenciais", () => {
  it("grava com permissão 600 — o token dá acesso à conta", async () => {
    const caminho = await gravarCredenciais(home, {
      apiUrl: "https://api.teste",
      criadoEm: "2026-07-23T00:00:00.000Z",
      token: "cp_abc",
    });
    const info = await stat(caminho);
    expect(info.mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(caminho, "utf8")).token).toBe("cp_abc");
  });

  it("lê de volta o que gravou", async () => {
    await gravarCredenciais(home, {
      apiUrl: "https://api.teste",
      criadoEm: "2026-07-23T00:00:00.000Z",
      token: "cp_abc",
    });
    expect(await lerCredenciais(home)).toMatchObject({
      apiUrl: "https://api.teste",
      token: "cp_abc",
    });
  });

  it("sem arquivo, com JSON quebrado ou com token de outro formato = sem conta", async () => {
    expect(await lerCredenciais(home)).toBeNull();

    await gravarCredenciais(home, {
      apiUrl: "https://api.teste",
      criadoEm: "x",
      token: "cp_ok",
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(caminhoCredenciais(home), "{ isso não é json");
    expect(await lerCredenciais(home)).toBeNull();

    await writeFile(caminhoCredenciais(home), JSON.stringify({ token: "sk-de-outro-servico" }));
    expect(await lerCredenciais(home)).toBeNull();
  });

  it("apagar devolve false quando não havia nada", async () => {
    expect(await apagarCredenciais(home)).toBe(false);
    await gravarCredenciais(home, { apiUrl: "u", criadoEm: "x", token: "cp_a" });
    expect(await apagarCredenciais(home)).toBe(true);
    expect(await lerCredenciais(home)).toBeNull();
  });
});

describe("device flow", () => {
  it("inicia e devolve os códigos", async () => {
    const inicio = await iniciarDevice("https://api.teste", async () =>
      respostaJson({
        codigoDispositivo: "segredo",
        codigoUsuario: "ABCD-EFGH",
        intervaloSegundos: 5,
        urlVerificacao: "https://site/entrar-dispositivo",
      }),
    );
    expect(inicio.codigoUsuario).toBe("ABCD-EFGH");
    expect(inicio.intervaloSegundos).toBe(5);
  });

  it("manda corpo JSON no início — sem ele o Fastify recusa com 400", async () => {
    let corpo: unknown;
    await iniciarDevice("https://api.teste", async (_url, init) => {
      corpo = init?.body;
      return respostaJson({
        codigoDispositivo: "s",
        codigoUsuario: "AAAA-BBBB",
        intervaloSegundos: 1,
        urlVerificacao: "u",
      });
    });
    expect(corpo).toBe("{}");
  });

  it("propaga a mensagem do servidor quando o início falha", async () => {
    await expect(
      iniciarDevice("https://api.teste", async () =>
        respostaJson({ mensagem: "Plataforma em manutenção." }, 503),
      ),
    ).rejects.toThrow("Plataforma em manutenção.");
  });

  it("traduz 202 em pendente e 410 em expirado", async () => {
    expect(
      await consultarDevice("https://a", "c", async () => respostaJson({ pendente: true }, 202)),
    ).toEqual({ estado: "pendente" });

    expect(
      await consultarDevice("https://a", "c", async () => new Response("", { status: 410 })),
    ).toEqual({ estado: "expirado" });

    expect(
      await consultarDevice("https://a", "c", async () => respostaJson({ token: "cp_x" })),
    ).toEqual({ estado: "pronto", token: "cp_x" });
  });
});

describe("fazerLogin", () => {
  it("mostra o código, espera a aprovação e grava as credenciais", async () => {
    const saida: string[] = [];
    let consultas = 0;

    await fazerLogin({
      apiUrl: "https://api.teste",
      buscar: async (url) => {
        if (String(url).endsWith("/iniciar")) {
          return respostaJson({
            codigoDispositivo: "segredo",
            codigoUsuario: "WXYZ-2345",
            intervaloSegundos: 1,
            urlVerificacao: "https://site/entrar-dispositivo",
          });
        }
        consultas += 1;
        // Só na terceira consulta o usuário terminou de aprovar no site.
        return consultas < 3
          ? respostaJson({ pendente: true }, 202)
          : respostaJson({ token: "cp_token_final" });
      },
      dormir: async () => {},
      escrever: (texto) => saida.push(texto),
      homeDirectory: home,
    });

    const tudo = saida.join("");
    expect(tudo).toContain("WXYZ-2345");
    expect(tudo).toContain("https://site/entrar-dispositivo");
    expect(consultas).toBe(3);
    expect((await lerCredenciais(home))?.token).toBe("cp_token_final");
  });

  it("desiste com mensagem clara quando o código expira", async () => {
    await expect(
      fazerLogin({
        apiUrl: "https://api.teste",
        buscar: async (url) =>
          String(url).endsWith("/iniciar")
            ? respostaJson({
                codigoDispositivo: "s",
                codigoUsuario: "AAAA-BBBB",
                intervaloSegundos: 1,
                urlVerificacao: "u",
              })
            : new Response("", { status: 410 }),
        dormir: async () => {},
        escrever: () => {},
        homeDirectory: home,
      }),
    ).rejects.toThrow(/expirou/);
  });

  it("desiste no tempo limite sem gravar nada", async () => {
    let relogio = 0;
    await expect(
      fazerLogin({
        agora: () => relogio,
        apiUrl: "https://api.teste",
        buscar: async (url) =>
          String(url).endsWith("/iniciar")
            ? respostaJson({
                codigoDispositivo: "s",
                codigoUsuario: "AAAA-BBBB",
                intervaloSegundos: 1,
                urlVerificacao: "u",
              })
            : respostaJson({ pendente: true }, 202),
        dormir: async () => {
          relogio += 60_000;
        },
        escrever: () => {},
        homeDirectory: home,
        tempoLimiteMs: 120_000,
      }),
    ).rejects.toThrow(/Tempo esgotado/);
    expect(await lerCredenciais(home)).toBeNull();
  });
});

describe("verificarToken", () => {
  it("400 do proxy significa token bom (passou na autenticação)", async () => {
    const r = await verificarToken("https://a", "cp_x", async () =>
      respostaJson({ erro: "corpo_invalido" }, 400),
    );
    expect(r.ok).toBe(true);
  });

  it("402 é token válido com limite estourado", async () => {
    const r = await verificarToken("https://a", "cp_x", async () =>
      respostaJson({ mensagem: "Você atingiu seu limite mensal." }, 402),
    );
    expect(r).toEqual({ mensagem: "Você atingiu seu limite mensal.", ok: true });
  });

  it("401 é token recusado", async () => {
    const r = await verificarToken("https://a", "cp_x", async () =>
      respostaJson({ mensagem: "Token inválido ou revogado." }, 401),
    );
    expect(r.ok).toBe(false);
  });

  it("erro de rede não estoura — vira mensagem legível", async () => {
    const r = await verificarToken("https://a", "cp_x", async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain("ECONNREFUSED");
  });
});
