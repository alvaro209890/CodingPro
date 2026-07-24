/** Configuração de runtime da API, lida do ambiente. */
export type ConfigApi = {
  /** Endereço de bind. Sempre 127.0.0.1 em produção — só o tunnel alcança. */
  readonly host: string;
  /** Porta reservada no inventário do P0. */
  readonly porta: number;
  /** Ambiente lógico; controla verbosidade de log e mensagens de erro. */
  readonly ambiente: "desenvolvimento" | "producao";
  /** Postgres. Vazio = modo degradado: só `/saude` responde. */
  readonly databaseUrl: string;
  /** Segredo do cookie de sessão. Rotacionar derruba todas as sessões. */
  readonly sessionSecret: string;
  /** Chave DeepSeek do servidor — é ela que paga as chamadas dos usuários. */
  readonly deepseekApiKey: string;
  /** Base da API DeepSeek (trocável para apontar a um mock em teste). */
  readonly deepseekBaseUrl: string;
  /** Origem pública do site, usada em CORS e nos links de e-mail. */
  readonly siteUrl: string;
  /** Limite mensal padrão de novos usuários, em micro-dólares (1e-6 USD). */
  readonly limitePadraoMicro: number;
  /** E-mail que recebe `admin: true` automaticamente no cadastro. */
  readonly emailAdmin: string;
  /** SMTP opcional para e-mails transacionais. Vazio = envio desativado. */
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly smtpUser: string;
  readonly smtpPass: string;
  readonly smtpFrom: string;
  /** Cloudflare Turnstile. Segredo vazio mantém bypass local/desenvolvimento. */
  readonly turnstileSecret: string;
  readonly turnstileSiteKey: string;
};

const PORTA_PADRAO = 8700;
const HOST_PADRAO = "127.0.0.1";
/** US$ 2,00/mês — teto conservador para beta fechado. */
const LIMITE_PADRAO_MICRO = 2_000_000;

function lerPorta(bruto: string | undefined): number {
  if (bruto === undefined || bruto.trim() === "") return PORTA_PADRAO;
  const valor = Number.parseInt(bruto, 10);
  if (!Number.isInteger(valor) || valor < 1 || valor > 65535) {
    throw new Error(`CODINGPRO_API_PORTA inválida: ${bruto}`);
  }
  return valor;
}

function lerPortaSmtp(bruto: string | undefined): number {
  if (bruto === undefined || bruto.trim() === "") return 587;
  const valor = Number.parseInt(bruto, 10);
  if (!Number.isInteger(valor) || valor < 1 || valor > 65535) {
    throw new Error(`SMTP_PORT inválida: ${bruto}`);
  }
  return valor;
}

function lerLimite(bruto: string | undefined): number {
  if (bruto === undefined || bruto.trim() === "") return LIMITE_PADRAO_MICRO;
  const valor = Number.parseInt(bruto, 10);
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`CODINGPRO_LIMITE_PADRAO_MICRO inválido: ${bruto}`);
  }
  return valor;
}

/** Monta a config a partir de um mapa de env (injetável para teste). */
export function carregarConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  const ambiente = env.CODINGPRO_AMBIENTE === "producao" ? "producao" : "desenvolvimento";
  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";
  if (ambiente === "producao" && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET ausente ou curto demais (mínimo 32 caracteres) em produção.");
  }

  return {
    ambiente,
    databaseUrl: env.DATABASE_URL?.trim() ?? "",
    deepseekApiKey: env.DEEPSEEK_API_KEY?.trim() ?? "",
    deepseekBaseUrl: env.CODINGPRO_DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    emailAdmin: env.CODINGPRO_EMAIL_ADMIN?.trim().toLowerCase() ?? "",
    host: env.CODINGPRO_API_HOST?.trim() || HOST_PADRAO,
    limitePadraoMicro: lerLimite(env.CODINGPRO_LIMITE_PADRAO_MICRO),
    porta: lerPorta(env.CODINGPRO_API_PORTA),
    sessionSecret: sessionSecret || "segredo-de-desenvolvimento-nao-usar-em-producao",
    siteUrl: env.CODINGPRO_SITE_URL?.trim() || "https://codingpro.cursar.space",
    smtpFrom: env.SMTP_FROM?.trim() ?? "",
    smtpHost: env.SMTP_HOST?.trim() ?? "",
    smtpPass: env.SMTP_PASS?.trim() ?? "",
    smtpPort: lerPortaSmtp(env.SMTP_PORT),
    smtpUser: env.SMTP_USER?.trim() ?? "",
    turnstileSecret: env.TURNSTILE_SECRET?.trim() || env.CLOUDFLARE_TURNSTILE_SECRET?.trim() || "",
    turnstileSiteKey:
      env.TURNSTILE_SITE_KEY?.trim() ||
      env.CODINGPRO_TURNSTILE_SITE_KEY?.trim() ||
      env.CLOUDFLARE_TURNSTILE_SITE_KEY?.trim() ||
      "",
  };
}
