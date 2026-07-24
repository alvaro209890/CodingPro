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

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buffer: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += BASE32[(valor >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) saida += BASE32[(valor << (5 - bits)) & 31] ?? "";
  return saida;
}

function decodificarBase32(segredo: string): Buffer | null {
  const limpo = segredo.replaceAll(/\s|=/gu, "").toUpperCase();
  if (limpo.length < 16 || !/^[A-Z2-7]+$/u.test(limpo)) return null;

  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const char of limpo) {
    const indice = BASE32.indexOf(char);
    if (indice === -1) return null;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo TOTP em base32, compatível com apps autenticadores. */
export function gerarSegredoTotp(): string {
  return base32(randomBytes(20));
}

export function otpauthUrl(email: string, segredo: string, issuer = "CodingPro"): string {
  const emissor = issuer.trim() || "CodingPro";
  const rotulo = `${emissor}:${email}`;
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: "6",
    issuer: emissor,
    period: "30",
    secret: segredo,
  });
  return `otpauth://totp/${encodeURIComponent(rotulo)}?${params.toString()}`;
}

function codigoTotp(segredo: string, contador: number): string | null {
  if (contador < 0) return null;
  const chave = decodificarBase32(segredo);
  if (!chave) return null;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac("sha1", chave).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binario =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binario % 1_000_000).padStart(6, "0");
}

/** Valida TOTP com janela curta para tolerar relógios levemente fora de sincronia. */
export function validarTotp(segredo: string, codigo: string, agora = Date.now()): boolean {
  const limpo = codigo.replaceAll(/\s|-/gu, "");
  if (!/^\d{6}$/u.test(limpo)) return false;
  const atual = Math.floor(agora / 30_000);
  for (let deslocamento = -1; deslocamento <= 1; deslocamento += 1) {
    const esperado = codigoTotp(segredo, atual + deslocamento);
    if (esperado && timingSafeEqual(Buffer.from(esperado), Buffer.from(limpo))) return true;
  }
  return false;
}

export const verificarTotp = validarTotp;

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
