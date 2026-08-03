import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";

const scrypt = promisify(scryptCallback);
const TAMANHO_HASH = 32;
const SAL_BYTES = 16;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function codificarBase32(buffer) {
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

async function hashSenha(senha) {
  const sal = randomBytes(SAL_BYTES);
  const derivada = await scrypt(senha.normalize("NFKC"), sal, TAMANHO_HASH);
  return `scrypt$${sal.toString("hex")}$${derivada.toString("hex")}`;
}

function otpauth(email, segredo) {
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: "6",
    issuer: "CodingPro",
    period: "30",
    secret: segredo,
  });
  return `otpauth://totp/${encodeURIComponent(`CodingPro:${email}`)}?${params.toString()}`;
}

async function executar() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const email = (process.env.CODINGPRO_EMAIL_ADMIN ?? "").trim().toLowerCase();
  if (databaseUrl === "" || email === "") {
    throw new Error("DATABASE_URL e CODINGPRO_EMAIL_ADMIN são obrigatórios.");
  }

  const senha = `Cp9!${randomBytes(24).toString("base64url")}`;
  const segredoTotp = codificarBase32(randomBytes(20));
  const senhaHash = await hashSenha(senha);
  const arquivo =
    process.env.CODINGPRO_ADMIN_BOOTSTRAP_FILE ??
    join(homedir(), ".config", "codingpro", "admin-bootstrap.json");

  await mkdir(dirname(arquivo), { mode: 0o700, recursive: true });
  await writeFile(
    arquivo,
    `${JSON.stringify(
      {
        email,
        geradoEm: new Date().toISOString(),
        otpauth: otpauth(email, segredoTotp),
        senha,
        totpSecret: segredoTotp,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await chmod(arquivo, 0o600);

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`
      INSERT INTO usuarios (
        email, senha_hash, nome, status, admin, email_verificado,
        codigo_verificacao, totp_secret, totp_ativado
      ) VALUES (
        ${email}, ${senhaHash}, 'Administrador CodingPro', 'ativo', true, true,
        NULL, ${segredoTotp}, true
      )
      ON CONFLICT (email) DO UPDATE SET
        senha_hash = EXCLUDED.senha_hash,
        status = 'ativo',
        admin = true,
        email_verificado = true,
        codigo_verificacao = NULL,
        totp_secret = EXCLUDED.totp_secret,
        totp_ativado = true
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }

  // Nunca imprime senha, segredo TOTP, hash ou URL do banco.
  console.log(`[reset-admin-totp] admin ativo; credenciais gravadas com modo 0600 em ${arquivo}`);
}

executar().catch(() => {
  console.error("[reset-admin-totp] falha ao recriar o admin; nenhum segredo foi exibido.");
  process.exitCode = 1;
});
