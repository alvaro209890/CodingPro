import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const manifesto = JSON.parse(readFileSync(join(raiz, "packages", "cli", "package.json"), "utf8"));
const temporario = mkdtempSync(join(tmpdir(), "codingpro-package-"));
const destinoPacote = join(temporario, "pacote");
const destinoInstalacao = join(temporario, "instalacao");
const ambiente = { ...process.env, NO_COLOR: "1" };

function executarBin(nome, argumentos) {
  return execFileSync(join(destinoInstalacao, "node_modules", ".bin", nome), argumentos, {
    encoding: "utf8",
    env: ambiente,
  });
}

try {
  execFileSync("pnpm", ["--filter", "codingpro", "pack", "--pack-destination", destinoPacote], {
    cwd: raiz,
    env: ambiente,
    stdio: "pipe",
  });

  const pacote = join(destinoPacote, `codingpro-${manifesto.version}.tgz`);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--offline", "--prefix", destinoInstalacao, pacote],
    { cwd: raiz, env: ambiente, stdio: "pipe" },
  );

  const versao = executarBin("codingpro", ["--version"]);
  if (versao.trim() !== manifesto.version) {
    throw new Error(`Versão inesperada do pacote: ${JSON.stringify(versao)}`);
  }

  const ajuda = executarBin("cpro", ["--help"]);
  if (!ajuda.includes("Uso: codingpro [opções]") || ajuda.includes("Options:")) {
    throw new Error(`Ajuda do pacote não está em pt-BR:\n${ajuda}`);
  }

  const erro = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["--inexistente"],
    { encoding: "utf8", env: ambiente },
  );
  if (erro.status !== 1 || !erro.stderr.includes("erro: opção desconhecida")) {
    throw new Error(`Erro inesperado do pacote: status=${erro.status}, stderr=${erro.stderr}`);
  }

  const artefato = join(destinoInstalacao, "node_modules", "codingpro", "dist", "index.mjs");
  const conteudo = readFileSync(artefato, "utf8");
  if (!conteudo.startsWith("#!/usr/bin/env node\n")) {
    throw new Error("O artefato instalado perdeu o shebang.");
  }
  if (process.platform !== "win32" && (statSync(artefato).mode & 0o111) === 0) {
    throw new Error("O artefato instalado não é executável.");
  }
} finally {
  // npm pode criar arquivos somente leitura em alguns ambientes; garante limpeza do fixture.
  chmodSync(temporario, 0o700);
  rmSync(temporario, { force: true, recursive: true });
}
