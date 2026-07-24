/**
 * Prepara diretório de empacotamento com dependências de produção (pnpm deploy)
 * e artefatos compilados do desktop — usado antes do electron-builder.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const repoRoot = join(pkgRoot, "..", "..");
const packDir = join(pkgRoot, ".pack");

console.log("[prepare-pack] build workspace…");
execSync("pnpm desktop:build", { cwd: repoRoot, stdio: "inherit" });

if (existsSync(packDir)) {
  rmSync(packDir, { recursive: true, force: true });
}
mkdirSync(packDir, { recursive: true });

console.log("[prepare-pack] pnpm deploy…");
execSync(`pnpm deploy --filter @codingpro/desktop --prod --legacy "${packDir}"`, {
  cwd: repoRoot,
  stdio: "inherit",
});

console.log("[prepare-pack] copiando dist…");
cpSync(join(pkgRoot, "dist"), join(packDir, "dist"), { recursive: true });

const pkgPath = join(packDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.main = "dist/main/index.js";
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

console.log("[prepare-pack] ok →", packDir);
