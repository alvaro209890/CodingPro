/**
 * Sobe o CodingPro Desktop a partir do build em dist/ (produção local).
 * Uso: pnpm --filter @codingpro/desktop start
 *      (ou node packages/desktop/scripts/start.mjs)
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const repoRoot = resolve(pkgRoot, "..", "..");
const mainEntry = join(pkgRoot, "dist", "main", "index.js");
const rendererHtml = join(pkgRoot, "dist", "renderer", "index.html");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/u)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

// Carrega chave sem imprimir
loadEnvFile(join(repoRoot, ".codingpro", ".env"));
loadEnvFile(join(pkgRoot, ".codingpro", ".env"));
loadEnvFile(
  join(process.env.USERPROFILE || process.env.HOME || "", ".config", "codingpro", "deepseek.env"),
);

if (!existsSync(mainEntry) || !existsSync(rendererHtml)) {
  console.error("[codingpro-desktop] Build ausente. Rode: pnpm --filter @codingpro/desktop build");
  process.exit(1);
}

const require = createRequire(import.meta.url);
let electronPath;
try {
  electronPath = require("electron");
} catch {
  console.error("[codingpro-desktop] Pacote electron não encontrado. pnpm install");
  process.exit(1);
}

const child = spawn(electronPath, [pkgRoot], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
  stdio: "inherit",
  windowsHide: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[codingpro-desktop] falha ao iniciar Electron:", err.message);
  process.exit(1);
});
