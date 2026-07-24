import { afterEach, describe, expect, it } from "vitest";
import { type Ambiente, cadastrar, montar, respostaSseFalsa, TEM_BANCO } from "./ajuda.js";

let amb: Ambiente | null = null;

afterEach(async () => {
  await amb?.fechar();
  amb = null;
});

describe.skipIf(!TEM_BANCO)("cadastro e login", () => {
  it("primeiro usuário vira admin ativo — senão não haveria quem aprovar", async () => {
    amb = await montar();
    const resposta = await amb.app.inject({
      method: "POST",
      payload: { email: "chefe@teste.com", nome: "Chefe", senha: "senhaBoa123" },
      url: "/api/cadastro",
    });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().usuario).toMatchObject({ admin: true, status: "ativo" });
  });

  it("segundo usuário entra pendente, sem poderes", async () => {
    amb = await montar();
    await cadastrar(amb.app, "chefe@teste.com");
    const resposta = await amb.app.inject({
      method: "POST",
      payload: { email: "novato@teste.com", nome: "Novato", senha: "senhaBoa123" },
      url: "/api/cadastro",
    });
    expect(resposta.json().usuario).toMatchObject({ admin: false, status: "pendente" });
  });

  it("recusa e-mail duplicado", async () => {
    amb = await montar();
    await cadastrar(amb.app, "alguem@teste.com");
    const resposta = await amb.app.inject({
      method: "POST",
      payload: { email: "alguem@teste.com", nome: "Outro", senha: "senhaBoa123" },
      url: "/api/cadastro",
    });
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("email_em_uso");
  });

  it("recusa senha fraca e e-mail inválido com mensagem em pt-BR", async () => {
    amb = await montar();
    const fraca = await amb.app.inject({
      method: "POST",
      payload: { email: "a@b.com", nome: "Ana", senha: "123" },
      url: "/api/cadastro",
    });
    expect(fraca.statusCode).toBe(400);
    expect(fraca.json().mensagem).toMatch(/8 caracteres/);

    const email = await amb.app.inject({
      method: "POST",
      payload: { email: "nao-e-email", nome: "Ana", senha: "senhaBoa123" },
      url: "/api/cadastro",
    });
    expect(email.json().erro).toBe("email_invalido");
  });

  it("faz login e devolve o próprio usuário em /api/eu", async () => {
    amb = await montar();
    await cadastrar(amb.app, "chefe@teste.com");
    const login = await amb.app.inject({
      method: "POST",
      payload: { email: "chefe@teste.com", senha: "senhaSegura123" },
      url: "/api/login",
    });
    expect(login.statusCode).toBe(200);
    const bruto = login.headers["set-cookie"];
    const cookie = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).split(";")[0] ?? "";

    const eu = await amb.app.inject({ headers: { cookie }, method: "GET", url: "/api/eu" });
    expect(eu.json().usuario.email).toBe("chefe@teste.com");
  });

  it("dá a mesma mensagem para e-mail inexistente e senha errada", async () => {
    amb = await montar();
    await cadastrar(amb.app, "existe@teste.com");
    const inexistente = await amb.app.inject({
      method: "POST",
      payload: { email: "naoexiste@teste.com", senha: "senhaSegura123" },
      url: "/api/login",
    });
    const senhaErrada = await amb.app.inject({
      method: "POST",
      payload: { email: "existe@teste.com", senha: "erradaTotal123" },
      url: "/api/login",
    });
    expect(inexistente.statusCode).toBe(401);
    expect(senhaErrada.statusCode).toBe(401);
    expect(inexistente.json().mensagem).toBe(senhaErrada.json().mensagem);
  });

  it("nega /api/eu sem sessão", async () => {
    amb = await montar();
    const resposta = await amb.app.inject({ method: "GET", url: "/api/eu" });
    expect(resposta.statusCode).toBe(401);
  });

  it("troca de senha revoga os tokens de CLI", async () => {
    amb = await montar();
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { nome: "t1" },
      url: "/api/tokens",
    });

    const troca = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { atual: "senhaSegura123", nova: "novaSenha4567" },
      url: "/api/senha",
    });
    expect(troca.json()).toMatchObject({ ok: true, tokensRevogados: 1 });

    const errada = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { atual: "senhaSegura123", nova: "outraSenha789" },
      url: "/api/senha",
    });
    expect(errada.json().erro).toBe("senha_incorreta");
  });
});

describe.skipIf(!TEM_BANCO)("tokens de CLI", () => {
  it("mostra o token uma única vez e guarda só o hash", async () => {
    amb = await montar();
    const { cookie, id } = await cadastrar(amb.app, "chefe@teste.com");
    const criado = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { nome: "meu notebook" },
      url: "/api/tokens",
    });
    expect(criado.statusCode).toBe(201);
    const texto = criado.json().texto as string;
    expect(texto.startsWith("cp_")).toBe(true);

    const lista = await amb.app.inject({ headers: { cookie }, method: "GET", url: "/api/tokens" });
    const tokens = lista.json().tokens;
    expect(tokens).toHaveLength(1);
    expect(JSON.stringify(tokens)).not.toContain(texto);

    const [linha] = await amb.sql`SELECT hash FROM tokens_cli WHERE usuario_id = ${id}`;
    expect(linha?.hash).not.toBe(texto);
  });

  it("conta pendente não consegue criar token", async () => {
    amb = await montar();
    await cadastrar(amb.app, "chefe@teste.com");
    const { cookie } = await cadastrar(amb.app, "novato@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { nome: "x" },
      url: "/api/tokens",
    });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json().erro).toBe("conta_nao_aprovada");
  });

  it("revoga o próprio token, mas não o dos outros", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const criado = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "POST",
      payload: { nome: "t" },
      url: "/api/tokens",
    });
    const tokenId = criado.json().token.id;

    const outro = await cadastrar(amb.app, "outro@teste.com");
    await amb.repo.atualizarUsuario(outro.id, { status: "ativo" });
    const alheio = await amb.app.inject({
      headers: { cookie: outro.cookie },
      method: "DELETE",
      url: `/api/tokens/${tokenId}`,
    });
    expect(alheio.statusCode).toBe(404);

    const proprio = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "DELETE",
      url: `/api/tokens/${tokenId}`,
    });
    expect(proprio.statusCode).toBe(200);
  });
});

describe.skipIf(!TEM_BANCO)("proxy LLM", () => {
  async function comToken(): Promise<{ token: string; cookie: string }> {
    if (!amb) throw new Error("ambiente não montado");
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    const criado = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { nome: "cli" },
      url: "/api/tokens",
    });
    return { cookie, token: criado.json().texto };
  }

  const CORPO = {
    messages: [{ content: "oi", role: "user" }],
    model: "deepseek-v4-pro",
    stream: true,
  };

  it("repassa a resposta e grava o consumo medido", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "chave-do-servidor" },
      fetch: async () =>
        respostaSseFalsa({
          completion_tokens: 500,
          prompt_cache_hit_tokens: 8000,
          prompt_tokens: 10_000,
        }),
    });
    const { cookie, token } = await comToken();

    const resposta = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toContain("olá");

    const consumo = await amb.app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/consumo",
    });
    const dados = consumo.json();
    expect(dados.requisicoes).toBe(1);
    expect(dados.custoMicro).toBeGreaterThan(0);

    const [evento] = await amb.sql`SELECT * FROM eventos_uso`;
    expect(evento).toMatchObject({
      modelo: "deepseek-v4-pro",
      tokens_cache: 8000,
      tokens_entrada: 10_000,
      tokens_saida: 500,
    });
  });

  it("manda a chave do SERVIDOR ao provedor, nunca o token do usuário", async () => {
    const vistos: string[] = [];
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "chave-do-servidor" },
      fetch: async (_url, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        vistos.push(String(headers?.authorization ?? ""));
        return respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 });
      },
    });
    const { token } = await comToken();
    await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(vistos).toEqual(["Bearer chave-do-servidor"]);
    expect(vistos[0]).not.toContain(token);
  });

  it("nega token ausente, inválido e revogado", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 }),
    });
    const { cookie, token } = await comToken();

    const semToken = await amb.app.inject({
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(semToken.statusCode).toBe(401);

    const invalido = await amb.app.inject({
      headers: { authorization: "Bearer cp_naoexiste" },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(invalido.statusCode).toBe(401);

    const lista = await amb.app.inject({ headers: { cookie }, method: "GET", url: "/api/tokens" });
    await amb.app.inject({
      headers: { cookie },
      method: "DELETE",
      url: `/api/tokens/${lista.json().tokens[0].id}`,
    });
    const revogado = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(revogado.statusCode).toBe(401);
  });

  it("corta com 402 quando o limite mensal acaba", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 }),
    });
    const { token } = await comToken();
    const usuario = await amb.repo.buscarPorEmail("chefe@teste.com");
    if (!usuario) throw new Error("usuário sumiu");

    await amb.repo.registrarUso({
      competencia: new Date().toISOString().slice(0, 7),
      custoMicro: 5_000_000,
      duracaoMs: 1,
      erro: null,
      modelo: "deepseek-v4-pro",
      tokenId: null,
      tokensCache: 0,
      tokensEntrada: 1,
      tokensRaciocinio: 0,
      tokensSaida: 1,
      usuarioId: usuario.id,
    });

    const resposta = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(resposta.statusCode).toBe(402);
    expect(resposta.json().erro).toBe("limite_atingido");
    expect(resposta.json().mensagem).toMatch(/limite mensal/);
  });

  it("recusa modelo fora da allowlist antes de gastar a chave", async () => {
    let chamou = false;
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => {
        chamou = true;
        return respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 });
      },
    });
    const { token } = await comToken();
    const resposta = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: { ...CORPO, model: "gpt-4" },
      url: "/v1/chat/completions",
    });
    expect(resposta.statusCode).toBe(400);
    expect(chamou).toBe(false);
  });

  it("kill switch derruba o proxy mas não o resto do site", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 }),
    });
    const { cookie, token } = await comToken();
    await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { ligado: true },
      url: "/api/admin/kill-switch",
    });

    const proxy = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(proxy.statusCode).toBe(503);
    expect(proxy.json().erro).toBe("manutencao");

    const eu = await amb.app.inject({ headers: { cookie }, method: "GET", url: "/api/eu" });
    expect(eu.statusCode).toBe(200);
  });

  it("conta bloqueada perde o acesso e os tokens", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 1, prompt_tokens: 1 }),
    });
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const vitima = await cadastrar(amb.app, "vitima@teste.com");
    await amb.repo.atualizarUsuario(vitima.id, { status: "ativo" });
    const criado = await amb.app.inject({
      headers: { cookie: vitima.cookie },
      method: "POST",
      payload: { nome: "t" },
      url: "/api/tokens",
    });
    const token = criado.json().texto;

    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { status: "bloqueado" },
      url: `/api/admin/usuarios/${vitima.id}`,
    });

    const resposta = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(resposta.statusCode).toBe(401);
  });

  it("erro do provedor não vaza o corpo em produção e é registrado", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => new Response("segredo interno do upstream", { status: 500 }),
    });
    const { token } = await comToken();
    const resposta = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: CORPO,
      url: "/v1/chat/completions",
    });
    expect(resposta.statusCode).toBe(502);
    const [evento] = await amb.sql`SELECT erro FROM eventos_uso`;
    expect(evento?.erro).toBe("upstream_500");
  });
});

describe.skipIf(!TEM_BANCO)("painel admin", () => {
  it("nega acesso a quem não é admin", async () => {
    amb = await montar();
    await cadastrar(amb.app, "chefe@teste.com");
    const { cookie } = await cadastrar(amb.app, "zé@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/admin/usuarios",
    });
    expect(resposta.statusCode).toBe(403);
  });

  it("aprova conta pendente e ela passa a poder criar token", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const novato = await cadastrar(amb.app, "novato@teste.com");

    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { status: "ativo" },
      url: `/api/admin/usuarios/${novato.id}`,
    });

    const token = await amb.app.inject({
      headers: { cookie: novato.cookie },
      method: "POST",
      payload: { nome: "x" },
      url: "/api/tokens",
    });
    expect(token.statusCode).toBe(201);
  });

  it("admin não consegue remover o próprio poder de admin", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { admin: false },
      url: `/api/admin/usuarios/${chefe.id}`,
    });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().erro).toBe("auto_rebaixamento");
  });

  it("registra as ações na auditoria", async () => {
    amb = await montar();
    const chefe = await cadastrar(amb.app, "chefe@teste.com");
    const novato = await cadastrar(amb.app, "novato@teste.com");
    await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "PATCH",
      payload: { limiteMicro: 9_000_000 },
      url: `/api/admin/usuarios/${novato.id}`,
    });

    const auditoria = await amb.app.inject({
      headers: { cookie: chefe.cookie },
      method: "GET",
      url: "/api/admin/auditoria",
    });
    const acoes = auditoria.json().registros.map((r: { acao: string }) => r.acao);
    expect(acoes).toContain("usuario_atualizado");
    expect(acoes).toContain("cadastro");
  });

  it("saúde reporta métricas do processo", async () => {
    amb = await montar();
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/admin/saude",
    });
    const dados = resposta.json();
    expect(dados.requisicoesTotal).toBeGreaterThan(0);
    expect(dados.killSwitch).toBe(false);
    expect(dados.memoriaProcessoMb).toBeGreaterThan(0);
  });
});

describe.skipIf(!TEM_BANCO)("device flow do codingpro login", () => {
  it("entrega o token só depois da aprovação no site, e uma vez só", async () => {
    amb = await montar();
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");

    const inicio = await amb.app.inject({ method: "POST", url: "/api/device/iniciar" });
    const { codigoDispositivo, codigoUsuario } = inicio.json();
    expect(codigoUsuario).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const antes = await amb.app.inject({
      method: "POST",
      payload: { codigoDispositivo },
      url: "/api/device/token",
    });
    expect(antes.statusCode).toBe(202);
    expect(antes.json().pendente).toBe(true);

    const aprovacao = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { codigoUsuario },
      url: "/api/device/aprovar",
    });
    expect(aprovacao.statusCode).toBe(200);

    const depois = await amb.app.inject({
      method: "POST",
      payload: { codigoDispositivo },
      url: "/api/device/token",
    });
    expect(depois.json().token).toMatch(/^cp_/);

    // Segunda tentativa não devolve nada: o código foi consumido.
    const denovo = await amb.app.inject({
      method: "POST",
      payload: { codigoDispositivo },
      url: "/api/device/token",
    });
    expect(denovo.statusCode).toBe(410);
  });

  it("o token entregue funciona de verdade no proxy", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () => respostaSseFalsa({ completion_tokens: 2, prompt_tokens: 3 }),
    });
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    const inicio = await amb.app.inject({ method: "POST", url: "/api/device/iniciar" });
    const { codigoDispositivo, codigoUsuario } = inicio.json();
    await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { codigoUsuario },
      url: "/api/device/aprovar",
    });
    const token = (
      await amb.app.inject({
        method: "POST",
        payload: { codigoDispositivo },
        url: "/api/device/token",
      })
    ).json().token;

    const uso = await amb.app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        messages: [{ content: "oi", role: "user" }],
        model: "deepseek-v4-pro",
        stream: true,
      },
      url: "/v1/chat/completions",
    });
    expect(uso.statusCode).toBe(200);
  });

  it("código inexistente é recusado", async () => {
    amb = await montar();
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { codigoUsuario: "ZZZZ-ZZZZ" },
      url: "/api/device/aprovar",
    });
    expect(resposta.statusCode).toBe(404);
  });

  it("aprovação duplicada não deixa token órfão", async () => {
    amb = await montar();
    const { cookie, id } = await cadastrar(amb.app, "chefe@teste.com");
    const inicio = await amb.app.inject({ method: "POST", url: "/api/device/iniciar" });
    const { codigoUsuario } = inicio.json();

    const primeira = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { codigoUsuario },
      url: "/api/device/aprovar",
    });
    expect(primeira.statusCode).toBe(200);

    const segunda = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { codigoUsuario },
      url: "/api/device/aprovar",
    });
    expect(segunda.statusCode).toBe(409);

    const tokens = await amb.sql`
      SELECT id FROM tokens_cli WHERE usuario_id = ${id} AND revogado_em IS NULL
    `;
    expect(tokens).toHaveLength(1);
  });
});

describe.skipIf(!TEM_BANCO)("agente do playground e limites", () => {
  it("recusa o agente com 402 quando o limite mensal acabou", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "oi" } }] }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    });
    const { cookie, id } = await cadastrar(amb.app, "chefe@teste.com");
    await amb.repo.registrarUso({
      competencia: new Date().toISOString().slice(0, 7),
      custoMicro: 5_000_000,
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
      method: "POST",
      payload: { prompt: "liste os arquivos" },
      url: "/api/vps/agent",
    });
    expect(resposta.statusCode).toBe(402);
    expect(resposta.json().erro).toBe("limite_atingido");
  });

  it("grava o consumo do playground no mesmo agregado mensal da CLI", async () => {
    amb = await montar({
      config: { DEEPSEEK_API_KEY: "k" },
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "pronto" } }],
            usage: { completion_tokens: 20, prompt_tokens: 100 },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
    });
    const { cookie } = await cadastrar(amb.app, "chefe@teste.com");
    const resposta = await amb.app.inject({
      headers: { cookie },
      method: "POST",
      payload: { prompt: "olá" },
      url: "/api/vps/agent",
    });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.body).toContain("pronto");

    const consumo = await amb.app.inject({
      headers: { cookie },
      method: "GET",
      url: "/api/consumo",
    });
    expect(consumo.json().requisicoes).toBe(1);
    expect(consumo.json().custoMicro).toBeGreaterThan(0);
  });
});
