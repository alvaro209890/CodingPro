/**
 * Copia os instaladores gerados para dist-site/downloads (servido pelo site).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const releaseCandidates = [
  join(repoRoot, "packages", "desktop", "release"),
  join(repoRoot, "packages", "desktop", ".pack", "release"),
];
const releaseDir = releaseCandidates.find((dir) => existsSync(dir));
const downloadsDir = join(repoRoot, "packages", "web", "dist-site", "downloads");

if (releaseDir === undefined) {
  console.error("[copy-desktop-release] release/ ausente. Rode: pnpm desktop:dist");
  process.exit(1);
}

mkdirSync(downloadsDir, { recursive: true });

const exts = [".exe", ".zip", ".blockmap", ".yml"];
let copiados = 0;
for (const nome of readdirSync(releaseDir)) {
  if (!exts.some((ext) => nome.endsWith(ext))) continue;
  const origem = join(releaseDir, nome);
  const destino = join(downloadsDir, nome);
  copyFileSync(origem, destino);
  console.log("[copy-desktop-release]", nome);
  copiados += 1;
}

if (copiados === 0) {
  console.error("[copy-desktop-release] nenhum artefato .exe encontrado em", releaseDir);
  process.exit(1);
}

console.log("[copy-desktop-release] ok →", downloadsDir);
