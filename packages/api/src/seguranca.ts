import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  senha: string | Buffer,
  sal: string | Buffer,
  tamanho: number,
) => Promise<Buffer>;

const TAMANHO_HASH = 32;
const SAL_BYTES = 16;

/**
 * Hash de senha com scrypt (nativo do Node — sem dependência binária).
 * Formato: `scrypt$<sal em hex>$<hash em hex>`.
 */
export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(SAL_BYTES);
  const derivada = await scrypt(senha.normalize("NFKC"), sal, TAMANHO_HASH);
  return `scrypt$${sal.toString("hex")}$${derivada.toString("hex")}`;
}

/** Confere a senha em tempo constante. Nunca lança: entrada malformada é `false`. */
export async function conferirSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const sal = Buffer.from(partes[1] ?? "", "hex");
  const esperado = Buffer.from(partes[2] ?? "", "hex");
  if (sal.length !== SAL_BYTES || esperado.length !== TAMANHO_HASH) return false;
  const derivada = await scrypt(senha.normalize("NFKC"), sal, TAMANHO_HASH);
  return timingSafeEqual(derivada, esperado);
}

/**
 * Erros de senha fraca, em pt-BR, para mostrar direto ao usuário.
 * Mínimo de 8 caracteres (decisão do Álvaro em 2026-07-23); letra + número seguem
 * obrigatórios, e o rate limit da API é quem segura tentativa em massa.
 */
export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (senha.length > 200) return "A senha é longa demais.";
  if (!/[a-zA-Z]/u.test(senha)) return "A senha precisa ter pelo menos uma letra.";
  if (!/[0-9]/u.test(senha)) return "A senha precisa ter pelo menos um número.";
  return null;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;

export function normalizarEmail(bruto: string): string | null {
  const email = bruto.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !RE_EMAIL.test(email)) return null;
  return email;
}

export const PREFIXO_TOKEN = "cp_";

export type TokenGerado = {
  /** Valor completo, mostrado ao usuário UMA única vez. */
  readonly texto: string;
  /** Início do token, guardado em claro para o usuário reconhecer na lista. */
  readonly prefixo: string;
  /** SHA-256 em hex — é isto que vai para o banco. */
  readonly hash: string;
};

/** Gera um token de CLI (`cp_` + 32 bytes aleatórios em base64url). */
export function gerarTokenCli(): TokenGerado {
  const texto = PREFIXO_TOKEN + randomBytes(32).toString("base64url");
  return { hash: hashToken(texto), prefixo: texto.slice(0, 11), texto };
}

/** Tokens são aleatórios de 256 bits: SHA-256 basta, não precisa de KDF lento. */
export function hashToken(texto: string): string {
  return createHmac("sha256", "codingpro-token").update(texto).digest("hex");
}

/** Código curto e legível para o device flow (`ABCD-EFGH`), sem letras ambíguas. */
export function gerarCodigoUsuario(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let saida = "";
  for (let i = 0; i < 8; i += 1) {
    if (i === 4) saida += "-";
    saida += alfabeto[randomInt(alfabeto.length)];
  }
  return saida;
}

/** Código numérico de 6 dígitos para verificação de e-mail. */
export function gerarCodigoVerificacao(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function gerarSegredoAleatorio(): string {
  return randomBytes(32).toString("base64url");
}

export type Sessao = {
  readonly usuarioId: number;
  readonly expiraEm: number;
};

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sessão sem estado: `<usuarioId>.<expiraEm>.<hmac>`. Não há tabela de sessões —
 * para invalidar tudo basta rotacionar `SESSION_SECRET`.
 */
export function assinarSessao(usuarioId: number, segredo: string, agora = Date.now()): string {
  const expiraEm = agora + DURACAO_SESSAO_MS;
  const corpo = `${usuarioId}.${expiraEm}`;
  return `${corpo}.${createHmac("sha256", segredo).update(corpo).digest("base64url")}`;
}

export function lerSessao(cookie: string, segredo: string, agora = Date.now()): Sessao | null {
  const partes = cookie.split(".");
  if (partes.length !== 3) return null;
  const [idBruto, expiraBruto, assinatura] = partes as [string, string, string];
  const corpo = `${idBruto}.${expiraBruto}`;
  const esperada = createHmac("sha256", segredo).update(corpo).digest("base64url");
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const usuarioId = Number.parseInt(idBruto, 10);
  const expiraEm = Number.parseInt(expiraBruto, 10);
  if (!Number.isSafeInteger(usuarioId) || !Number.isSafeInteger(expiraEm)) return null;
  if (expiraEm <= agora) return null;
  return { expiraEm, usuarioId };
}
