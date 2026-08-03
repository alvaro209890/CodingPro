import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { hashSenha } from "../dist/index.mjs";

const CONFIRMACAO = "APROVACAO_CREDITOS_PRODUCAO";

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

async function pedir(baseUrl, caminho, opcoes = {}) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    ...opcoes,
    headers: {
      "content-type": "application/json",
      ...(opcoes.headers ?? {}),
    },
  });
  const texto = await resposta.text();
  let corpo = null;
  try {
    corpo = texto === "" ? null : JSON.parse(texto);
  } catch {
    corpo = null;
  }
  return {
    corpo,
    cookie: (resposta.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "",
    status: resposta.status,
  };
}

function registrarPasso(nome) {
  console.log(`[e2e-producao] PASS ${nome}`);
}

async function executar() {
  exigir(
    process.env.CODINGPRO_E2E_CONFIRM === CONFIRMACAO,
    `Defina CODINGPRO_E2E_CONFIRM=${CONFIRMACAO} para executar.`,
  );
  const databaseUrl = process.env.DATABASE_URL ?? "";
  exigir(databaseUrl !== "", "DATABASE_URL e obrigatoria.");
  const baseUrl = process.env.CODINGPRO_E2E_BASE_URL ?? "http://127.0.0.1:8700";
  exigir(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/u.test(baseUrl), "Use apenas a API local.");

  const marca = randomBytes(8).toString("hex");
  const emailAdmin = `e2e-admin-${marca}@local.invalid`;
  const emailUsuario = `e2e-user-${marca}@local.invalid`;
  const senhaAdmin = `Cp9!${randomBytes(18).toString("base64url")}`;
  const senhaUsuario = `Cp9!${randomBytes(18).toString("base64url")}`;
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const [admin] = await sql`
      INSERT INTO usuarios (
        email, senha_hash, nome, status, admin, email_verificado,
        codigo_verificacao, creditos_micro
      ) VALUES (
        ${emailAdmin}, ${await hashSenha(senhaAdmin)}, 'Admin E2E temporario', 'ativo', true, true,
        NULL, 0
      )
      RETURNING id
    `;
    exigir(Number.isSafeInteger(Number(admin?.id)), "Nao foi possivel criar o admin temporario.");

    const loginAdmin = await pedir(baseUrl, "/api/login", {
      body: JSON.stringify({ email: emailAdmin, senha: senhaAdmin }),
      method: "POST",
    });
    exigir(loginAdmin.status === 200 && loginAdmin.cookie !== "", "Login do admin falhou.");
    const cookieAdmin = loginAdmin.cookie;
    const checkAdmin = await pedir(baseUrl, "/api/admin/check", {
      headers: { cookie: cookieAdmin },
      method: "GET",
    });
    exigir(checkAdmin.status === 200 && checkAdmin.corpo?.admin === true, "Check do admin falhou.");
    registrarPasso("login por senha e sessao admin");

    const cadastro = await pedir(baseUrl, "/api/cadastro", {
      body: JSON.stringify({
        email: emailUsuario,
        nome: "Usuario E2E temporario",
        senha: senhaUsuario,
        termosAceitos: true,
      }),
      method: "POST",
    });
    exigir(cadastro.status === 201, "Cadastro publico falhou.");
    exigir(cadastro.corpo?.usuario?.status === "pendente", "Conta nao nasceu pendente.");
    exigir(cadastro.corpo?.usuario?.creditosMicro === 0, "Conta nao nasceu com saldo zero.");
    const usuarioId = Number(cadastro.corpo.usuario.id);
    registrarPasso("cadastro pendente e sem creditos");

    const aprovar = await pedir(baseUrl, `/api/admin/usuarios/${usuarioId}`, {
      body: JSON.stringify({ creditosMicro: 1_000_000, status: "ativo" }),
      headers: { cookie: cookieAdmin },
      method: "PATCH",
    });
    exigir(
      aprovar.status === 200 && aprovar.corpo?.creditosMicro === 1_000_000,
      "Aprovacao falhou.",
    );

    const loginUsuario = await pedir(baseUrl, "/api/login", {
      body: JSON.stringify({ email: emailUsuario, senha: senhaUsuario }),
      method: "POST",
    });
    exigir(loginUsuario.status === 200 && loginUsuario.cookie !== "", "Login do usuario falhou.");

    const inicio = await pedir(baseUrl, "/api/device/iniciar", { body: "{}", method: "POST" });
    exigir(inicio.status === 201, "Inicio do device flow falhou.");
    const autorizar = await pedir(baseUrl, "/api/device/aprovar", {
      body: JSON.stringify({ codigoUsuario: inicio.corpo.codigoUsuario }),
      headers: { cookie: loginUsuario.cookie },
      method: "POST",
    });
    exigir(autorizar.status === 200, "Aprovacao do device flow falhou.");
    const troca = await pedir(baseUrl, "/api/device/token", {
      body: JSON.stringify({ codigoDispositivo: inicio.corpo.codigoDispositivo }),
      method: "POST",
    });
    exigir(
      troca.status === 200 && typeof troca.corpo?.token === "string",
      "Emissao de token falhou.",
    );
    const token = troca.corpo.token;
    registrarPasso("aprovacao, creditos e device flow");

    const pendente = await pedir(baseUrl, `/api/admin/usuarios/${usuarioId}`, {
      body: JSON.stringify({ status: "pendente" }),
      headers: { cookie: cookieAdmin },
      method: "PATCH",
    });
    exigir(pendente.status === 200, "Nao foi possivel voltar a conta para pendente.");
    const bloqueioPendente = await pedir(baseUrl, "/v1/chat/completions", {
      body: JSON.stringify({
        messages: [{ content: "Responda OK.", role: "user" }],
        model: "deepseek-v4-flash",
      }),
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
    });
    exigir(
      bloqueioPendente.status === 403 && bloqueioPendente.corpo?.erro === "conta_nao_aprovada",
      "Conta pendente nao recebeu o bloqueio esperado.",
    );
    registrarPasso("proxy bloqueia conta pendente com 403");

    await pedir(baseUrl, `/api/admin/usuarios/${usuarioId}`, {
      body: JSON.stringify({ status: "ativo" }),
      headers: { cookie: cookieAdmin },
      method: "PATCH",
    });
    const chamada = async () =>
      await pedir(baseUrl, "/v1/chat/completions", {
        body: JSON.stringify({
          max_tokens: 8,
          messages: [{ content: "Responda apenas OK.", role: "user" }],
          model: "deepseek-v4-flash",
          stream: false,
        }),
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
      });
    const primeiraChamada = await chamada();
    exigir(primeiraChamada.status === 200, "Chamada real ao provedor falhou.");
    const [depoisDoUso] = await sql`
      SELECT creditos_micro FROM usuarios WHERE id = ${usuarioId}
    `;
    exigir(Number(depoisDoUso?.creditos_micro) < 1_000_000, "O saldo nao foi debitado.");
    registrarPasso("proxy real e debito atomico");

    await sql`UPDATE usuarios SET creditos_micro = 0 WHERE id = ${usuarioId}`;
    const semSaldo = await chamada();
    exigir(
      semSaldo.status === 402 && semSaldo.corpo?.erro === "creditos_esgotados",
      "Saldo zero nao recebeu o bloqueio esperado.",
    );
    registrarPasso("proxy bloqueia saldo zero com 402");

    const recarga = await pedir(baseUrl, `/api/admin/usuarios/${usuarioId}`, {
      body: JSON.stringify({ creditosMicro: 1_000_000 }),
      headers: { cookie: cookieAdmin },
      method: "PATCH",
    });
    exigir(recarga.status === 200 && recarga.corpo?.creditosMicro === 1_000_000, "Recarga falhou.");
    const segundaChamada = await chamada();
    exigir(segundaChamada.status === 200, "Chamada apos recarga falhou.");
    registrarPasso("recarga reabilita o proxy");
  } finally {
    await sql`DELETE FROM auditoria WHERE ator_email IN (${emailAdmin}, ${emailUsuario}) OR alvo IN (${emailAdmin}, ${emailUsuario})`;
    await sql`DELETE FROM usuarios WHERE email IN (${emailAdmin}, ${emailUsuario})`;
    await sql.end({ timeout: 5 });
  }

  console.log("[e2e-producao] PASS fluxo completo; contas temporarias removidas");
}

executar().catch((erro) => {
  console.error(
    `[e2e-producao] FAIL ${erro instanceof Error ? erro.message : "erro desconhecido"}`,
  );
  process.exitCode = 1;
});
