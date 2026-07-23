import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Conta do CodingPro Cloud: o usuário roda a CLI com um token `cp_` emitido pelo site,
 * em vez de uma chave DeepSeek própria. O token vale só para contas criadas e aprovadas
 * na plataforma — é o servidor que valida, a CLI só o transporta.
 */
export type Credenciais = {
  readonly token: string;
  readonly apiUrl: string;
  readonly email?: string;
  readonly criadoEm: string;
};

export const API_PADRAO = "https://codingpro-api.cursar.space";

export function caminhoCredenciais(homeDirectory: string): string {
  return join(homeDirectory, ".codingpro", "credenciais.json");
}

/** Lê as credenciais salvas. Arquivo ausente ou corrompido = sem conta (não é erro). */
export async function lerCredenciais(homeDirectory: string): Promise<Credenciais | null> {
  try {
    const bruto = await readFile(caminhoCredenciais(homeDirectory), "utf8");
    const dados = JSON.parse(bruto) as Partial<Credenciais>;
    if (typeof dados.token !== "string" || !dados.token.startsWith("cp_")) return null;
    return {
      apiUrl: typeof dados.apiUrl === "string" ? dados.apiUrl : API_PADRAO,
      criadoEm: typeof dados.criadoEm === "string" ? dados.criadoEm : new Date().toISOString(),
      token: dados.token,
      ...(typeof dados.email === "string" ? { email: dados.email } : {}),
    };
  } catch {
    return null;
  }
}

/** Grava com permissão 600: o token dá acesso à conta e não pode ficar legível por outros. */
export async function gravarCredenciais(
  homeDirectory: string,
  credenciais: Credenciais,
): Promise<string> {
  const caminho = caminhoCredenciais(homeDirectory);
  await mkdir(dirname(caminho), { mode: 0o700, recursive: true });
  await writeFile(caminho, `${JSON.stringify(credenciais, null, 2)}\n`, { mode: 0o600 });
  await chmod(caminho, 0o600).catch(() => {});
  return caminho;
}

export async function apagarCredenciais(homeDirectory: string): Promise<boolean> {
  try {
    await rm(caminhoCredenciais(homeDirectory));
    return true;
  } catch {
    return false;
  }
}

export type InicioDevice = {
  readonly codigoDispositivo: string;
  readonly codigoUsuario: string;
  readonly urlVerificacao: string;
  readonly intervaloSegundos: number;
};

type Buscar = typeof globalThis.fetch;

async function json(resposta: Response): Promise<Record<string, unknown>> {
  try {
    return (await resposta.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mensagemDe(corpo: Record<string, unknown>, padrao: string): string {
  return typeof corpo.mensagem === "string" ? corpo.mensagem : padrao;
}

export async function iniciarDevice(apiUrl: string, buscar: Buscar): Promise<InicioDevice> {
  const resposta = await buscar(`${apiUrl}/api/device/iniciar`, {
    // Corpo `{}` explícito: declarar `application/json` sem corpo faz o Fastify
    // recusar a requisição com 400 antes mesmo de chegar na rota.
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const corpo = await json(resposta);
  if (!resposta.ok) {
    throw new Error(mensagemDe(corpo, "Não consegui iniciar o login. Tente de novo."));
  }
  return {
    codigoDispositivo: String(corpo.codigoDispositivo),
    codigoUsuario: String(corpo.codigoUsuario),
    intervaloSegundos: Number(corpo.intervaloSegundos) || 3,
    urlVerificacao: String(corpo.urlVerificacao),
  };
}

export type ResultadoPoll =
  | { readonly estado: "pendente" }
  | { readonly estado: "pronto"; readonly token: string }
  | { readonly estado: "expirado" };

export async function consultarDevice(
  apiUrl: string,
  codigoDispositivo: string,
  buscar: Buscar,
): Promise<ResultadoPoll> {
  const resposta = await buscar(`${apiUrl}/api/device/token`, {
    body: JSON.stringify({ codigoDispositivo }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (resposta.status === 410) return { estado: "expirado" };
  const corpo = await json(resposta);
  if (resposta.status === 202) return { estado: "pendente" };
  if (!resposta.ok) throw new Error(mensagemDe(corpo, "Falha ao concluir o login."));
  const token = corpo.token;
  if (typeof token !== "string") return { estado: "pendente" };
  return { estado: "pronto", token };
}

/** Confere se o token ainda vale e de quem ele é. Usado por `codingpro conta`. */
export async function verificarToken(
  apiUrl: string,
  token: string,
  buscar: Buscar,
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const resposta = await buscar(`${apiUrl}/v1/chat/completions`, {
      body: JSON.stringify({ messages: [], model: "deepseek-v4-flash" }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      method: "POST",
    });
    const corpo = await json(resposta);
    // 400 aqui é boa notícia: o token passou pela autenticação e só o corpo foi recusado.
    if (resposta.status === 400) return { mensagem: "Token válido.", ok: true };
    if (resposta.status === 402) {
      return { mensagem: mensagemDe(corpo, "Limite mensal atingido."), ok: true };
    }
    return { mensagem: mensagemDe(corpo, `Token recusado (${resposta.status}).`), ok: false };
  } catch (causa) {
    return { mensagem: `Não consegui falar com ${apiUrl}: ${String(causa)}`, ok: false };
  }
}

export type OpcoesLogin = {
  readonly apiUrl: string;
  readonly homeDirectory: string;
  readonly buscar: Buscar;
  readonly escrever: (texto: string) => void;
  /** Injetável para teste: evita esperar de verdade entre as consultas. */
  readonly dormir?: (ms: number) => Promise<void>;
  readonly agora?: () => number;
  readonly tempoLimiteMs?: number;
};

const dormirPadrao = (ms: number): Promise<void> =>
  new Promise((resolver) => {
    setTimeout(resolver, ms);
  });

/**
 * Fluxo completo do `codingpro login`: pede o código, mostra ao usuário e fica
 * consultando até o site aprovar. Devolve o caminho do arquivo de credenciais.
 */
export async function fazerLogin(opcoes: OpcoesLogin): Promise<string> {
  const dormir = opcoes.dormir ?? dormirPadrao;
  const agora = opcoes.agora ?? Date.now;
  const limite = opcoes.tempoLimiteMs ?? 10 * 60 * 1000;

  const inicio = await iniciarDevice(opcoes.apiUrl, opcoes.buscar);

  opcoes.escrever(
    [
      "",
      "  Para entrar na sua conta do CodingPro:",
      "",
      `  1. abra  ${inicio.urlVerificacao}`,
      `  2. digite o código  ${inicio.codigoUsuario}`,
      "",
      "  Aguardando a confirmação no site…",
      "",
    ].join("\n"),
  );

  const comeco = agora();
  while (agora() - comeco < limite) {
    await dormir(inicio.intervaloSegundos * 1000);
    const resultado = await consultarDevice(opcoes.apiUrl, inicio.codigoDispositivo, opcoes.buscar);
    if (resultado.estado === "expirado") {
      throw new Error("O código expirou. Rode `codingpro login` de novo.");
    }
    if (resultado.estado === "pronto") {
      const caminho = await gravarCredenciais(opcoes.homeDirectory, {
        apiUrl: opcoes.apiUrl,
        criadoEm: new Date().toISOString(),
        token: resultado.token,
      });
      opcoes.escrever(`  ✓ Conta conectada. Credenciais em ${caminho}\n`);
      return caminho;
    }
  }

  throw new Error("Tempo esgotado esperando a confirmação. Rode `codingpro login` de novo.");
}
