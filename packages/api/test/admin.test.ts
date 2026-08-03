import { afterEach, describe, expect, it } from "vitest";
import {
  type Ambiente,
  cadastrar,
  conectarDispositivo,
  montar,
  respostaSseFalsa,
  TEM_BANCO,
} from "./ajuda.js";

let amb: Ambiente | null = null;

afterEach(async () => {
  await amb?.fechar();
  amb = null;
});

describe.skipIf(!TEM_BANCO)("rotas de admin", () => {
  it("lista usuários com consumo", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    await cadastrar(amb.app, "novato@teste.com");

    const resposta = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/usuarios",
    });
    const usuarios = resposta.json().usuarios;
    expect(usuarios).toHaveLength(2);
    expect(usuarios[0]).toHaveProperty("custoMicro");
    expect(usuarios[0]).toHaveProperty("creditosMicro");
    expect(usuarios[0]).not.toHaveProperty("codigoVerificacao");
  });

  it("filtra a lista por nome e e-mail", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com", "senhaSegura123", "Chefe");
    await cadastrar(amb.app, "maria@outro.com", "senhaSegura123", "Maria Silva");

    const porEmail = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/usuarios?busca=outro.com",
    });
    expect(porEmail.json().usuarios).toHaveLength(1);

    const porNome = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/usuarios?busca=maria",
    });
    expect(porNome.json().usuarios[0].email).toBe("maria@outro.com");

    const semResultado = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/usuarios?busca=ninguem",
    });
    expect(semResultado.json().usuarios).toHaveLength(0);
  });

  it("soma liberações de créditos e registra a auditoria específica", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const novato = await cadastrar(amb.app, "novato@teste.com");

    for (const creditosMicro of [500_000, 250_000]) {
      const resposta = await amb.app.inject({
        headers: { cookie: chefe.cookie },
        method: "PATCH",
        payload: { creditosMicro },
        url: `/api/admin/usuarios/${novato.id}`,
      });
      expect(resposta.statusCode).toBe(200);
    }

    const usuario = await amb.repo.buscarPorId(novato.id);
    expect(Number(usuario?.creditos_micro)).toBe(750_000);

    const auditoria = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/auditoria?acao=creditos_liberados",
    });
    expect(auditoria.json().registros).toHaveLength(2);
    expect(auditoria.json().registros[0].detalhe).toMatchObject({ valorMicro: 250_000 });
  });

  it("edita o limite mensal e o proxy passa a respeitar o novo valor", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 }),
    });
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const token = (await conectarDispositivo(amb.app, chefe.cookie)).token;

    // Limite zerado = corta na primeira chamada.
    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { limiteMicro: 1 },
      url: `/api/admin/usuarios/${chefe.id}`,
    });
    await amb.repo.registrarUso({
      competencia: new Date().toISOString().slice(0, 7),
      custoMicro: 5,
      duracaoMs: 1,
      erro: null,
      modelo: "deepseek-v4-pro",
      tokenId: null,
      tokensCache: 0,
      tokensEntrada: 1,
      tokensRaciocinio: 0,
      tokensSaida: 1,
      usuarioId: chefe.id,
    });

    const bloqueado = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        messages: [{ content: "oi", role: "user" }],
        model: "deepseek-v4-pro",
        stream: true,
      },
      url: "/v1/chat/completions",
    });
    expect(bloqueado.statusCode).toBe(402);

    // Limite generoso reabre.
    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { limiteMicro: 10_000_000 },
      url: `/api/admin/usuarios/${chefe.id}`,
    });
    const liberado = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        messages: [{ content: "oi", role: "user" }],
        model: "deepseek-v4-pro",
        stream: true,
      },
      url: "/v1/chat/completions",
    });
    expect(liberado.statusCode).toBe(200);
  });

  it("limite zero significa sem limite", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 }),
    });
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const token = (await conectarDispositivo(amb.app, chefe.cookie)).token;

    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { limiteMicro: 0 },
      url: `/api/admin/usuarios/${chefe.id}`,
    });
    await amb.repo.registrarUso({
      competencia: new Date().toISOString().slice(0, 7),
      custoMicro: 999_999_999,
      duracaoMs: 1,
      erro: null,
      modelo: "deepseek-v4-pro",
      tokenId: null,
      tokensCache: 0,
      tokensEntrada: 1,
      tokensRaciocinio: 0,
      tokensSaida: 1,
      usuarioId: chefe.id,
    });

    const resposta = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        messages: [{ content: "oi", role: "user" }],
        model: "deepseek-v4-pro",
        stream: true,
      },
      url: "/v1/chat/completions",
    });
    expect(resposta.statusCode).toBe(200);
  });

  it("recusa status, limite e id inválidos", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const pedir = (payload: unknown, id: string | number = chefe.id) =>
      amb?.app.inject({
        headers: { cookie: chefe.cookie },
        method: "PATCH",
        payload: payload as never,
        url: `/api/admin/usuarios/${id}`,
      });

    expect((await pedir({ status: "inventado" }))?.json().erro).toBe("status_invalido");
    expect((await pedir({ limiteMicro: -5 }))?.json().erro).toBe("limite_invalido");
    expect((await pedir({ limiteMicro: 1.5 }))?.json().erro).toBe("limite_invalido");
    expect((await pedir({ creditosMicro: 0 }))?.json().erro).toBe("creditos_invalidos");
    expect((await pedir({ creditosMicro: -1 }))?.json().erro).toBe("creditos_invalidos");
    expect((await pedir({ status: "ativo" }, "abc"))?.json().erro).toBe("id_invalido");
    expect((await pedir({ status: "ativo" }, 999_999))?.json().erro).toBe("usuario_inexistente");
  });

  it("revoga todos os tokens de um usuário pelo painel", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    await conectarDispositivo(amb.app, chefe.cookie);
    await conectarDispositivo(amb.app, chefe.cookie);

    const resposta = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "POST",
      url: `/api/admin/usuarios/${chefe.id}/revogar-tokens`,
    });
    expect(resposta.json()).toEqual({ ok: true, total: 2 });
  });

  it("consumo geral agrega diário e top de usuários", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 500, prompt_tokens: 9000 }),
    });
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const token = (await conectarDispositivo(amb.app, chefe.cookie)).token;
    await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        messages: [{ content: "oi", role: "user" }],
        model: "deepseek-v4-pro",
        stream: true,
      },
      url: "/v1/chat/completions",
    });

    const resposta = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/consumo",
    });
    const dados = resposta.json();
    expect(dados.totalRequisicoes).toBe(1);
    expect(dados.totalMicro).toBeGreaterThan(0);
    expect(dados.top[0].email).toBe("chefe@teste.com");
    expect(dados.diario).toHaveLength(1);
  });

  it("auditoria filtra por ação e pagina", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    await conectarDispositivo(amb.app, chefe.cookie);

    const filtrada = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/auditoria?acao=token_criado",
    });
    const registros = filtrada.json().registros;
    expect(registros).toHaveLength(1);
    expect(registros[0].acao).toBe("token_criado");

    const pagina2 = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/auditoria?pagina=1",
    });
    expect(pagina2.json()).toMatchObject({ pagina: 1, registros: [] });
  });

  it("kill switch liga e desliga, e fica registrado", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");

    const ligar = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "POST",
      payload: { ligado: true },
      url: "/api/admin/kill-switch",
    });
    expect(ligar.json().killSwitch).toBe(true);

    const saude = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/saude",
    });
    expect(saude.json().killSwitch).toBe(true);

    const desligar = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "POST",
      payload: { ligado: false },
      url: "/api/admin/kill-switch",
    });
    expect(desligar.json().killSwitch).toBe(false);

    const auditoria = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/auditoria?acao=kill_switch",
    });
    expect(auditoria.json().registros).toHaveLength(2);
  });

  it("todas as rotas de admin negam quem não é admin", async () => {
    amb = await montar();
    await cadastrar(amb.app, "chefe@teste.com");
    const { cookie } = await cadastrar(amb.app, "ze@teste.com");

    for (const url of [
      "/api/admin/check",
      "/api/admin/usuarios",
      "/api/admin/consumo",
      "/api/admin/saude",
      "/api/admin/auditoria",
    ]) {
      const resposta = await amb.app.inject({ headers: { cookie }, method: "GET", url });
      expect(resposta.statusCode, url).toBe(403);
    }

    const kill = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { ligado: true },
      url: "/api/admin/kill-switch",
    });
    expect(kill.statusCode).toBe(403);
  });

  it("promove outro usuário a admin", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const outro = await cadastrar(amb.app, "outro@teste.com");

    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { admin: true, status: "ativo" },
      url: `/api/admin/usuarios/${outro.id}`,
    });

    const check = await amb.app.inject({
      headers: { cookie: outro.cookie },
      method: "GET",
      url: "/api/admin/check",
    });
    expect(check.statusCode).toBe(200);
  });
});

describe.skipIf(!TEM_BANCO)("consumo do usuário", () => {
  it("devolve zeros para quem nunca usou", async () => {
    amb = await montar();
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/consumo",
    });
    expect(resposta.json()).toMatchObject({
      creditosMicro: 1_000_000_000,
      custoMicro: 0,
      diario: [],
      percentual: 0,
      requisicoes: 0,
    });
    expect(resposta.json().diasAteRenovar).toBeGreaterThan(0);
  });

  it("percentual é zero quando não há limite, em vez de dividir por zero", async () => {
    amb = await montar();
    const { cookie, id } = await cadastrar(amb.app, "chefe@teste.com");
    await amb.repo.atualizarUsuario(id, { limiteMicro: 0 });
    await amb.repo.registrarUso({
      competencia: new Date().toISOString().slice(0, 7),
      custoMicro: 1234,
      duracaoMs: 1,
      erro: null,
      modelo: "deepseek-v4-pro",
      tokenId: null,
      tokensCache: 0,
      tokensEntrada: 1,
      tokensRaciocinio: 0,
      tokensSaida: 1,
      usuarioId: id,
    });

    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/consumo",
    });
    expect(resposta.json().percentual).toBe(0);
    expect(resposta.json().custoMicro).toBe(1234);
  });
});
