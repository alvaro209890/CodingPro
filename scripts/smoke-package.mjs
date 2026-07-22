import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const manifesto = JSON.parse(readFileSync(join(raiz, "packages", "cli", "package.json"), "utf8"));
const temporario = mkdtempSync(join(tmpdir(), "codingpro-package-"));
const destinoPacote = join(temporario, "pacote");
const destinoInstalacao = join(temporario, "instalacao");
const homeIsolada = join(temporario, "home");
const xdgIsolado = join(temporario, "xdg");
const replayFile = join(temporario, "fixture olá.jsonl");
const ambienteFerramentas = { ...process.env, NO_COLOR: "1" };
const ambienteCli = {
  COMSPEC: process.env.COMSPEC,
  CODINGPRO_PROVIDER: "replay",
  CODINGPRO_REPLAY_FILE: replayFile,
  HOME: homeIsolada,
  LANG: process.env.LANG ?? "C.UTF-8",
  LC_ALL: process.env.LC_ALL,
  NO_COLOR: "1",
  PATH: process.env.PATH,
  PATHEXT: process.env.PATHEXT,
  SYSTEMROOT: process.env.SYSTEMROOT,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  TMPDIR: process.env.TMPDIR,
  XDG_CONFIG_HOME: xdgIsolado,
};

mkdirSync(homeIsolada, { recursive: true });
mkdirSync(xdgIsolado, { recursive: true });
writeFileSync(
  replayFile,
  `${JSON.stringify({
    events: [
      { text: "Olá! ", type: "text-delta" },
      { text: "Como posso ajudar?", type: "text-delta" },
      {
        message: { content: "Olá! Como posso ajudar?", role: "assistant" },
        reason: "stop",
        type: "finish",
      },
    ],
    request: { messages: [{ content: "olá", role: "user" }] },
  })}\n`,
  "utf8",
);

function executarBin(nome, argumentos) {
  return execFileSync(join(destinoInstalacao, "node_modules", ".bin", nome), argumentos, {
    encoding: "utf8",
    env: ambienteCli,
  });
}

try {
  execFileSync("pnpm", ["--filter", "codingpro", "pack", "--pack-destination", destinoPacote], {
    cwd: raiz,
    env: ambienteFerramentas,
    stdio: "pipe",
  });

  const pacote = join(destinoPacote, `codingpro-${manifesto.version}.tgz`);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--offline", "--prefix", destinoInstalacao, pacote],
    { cwd: raiz, env: ambienteFerramentas, stdio: "pipe" },
  );

  const versao = executarBin("codingpro", ["--version"]);
  if (versao.trim() !== manifesto.version) {
    throw new Error(`Versão inesperada do pacote: ${JSON.stringify(versao)}`);
  }

  const ajuda = executarBin("cpro", ["--help"]);
  if (!ajuda.includes("Uso: codingpro [opções]") || ajuda.includes("Options:")) {
    throw new Error(`Ajuda do pacote não está em pt-BR:\n${ajuda}`);
  }

  const respostaCodingPro = executarBin("codingpro", ["-p", "olá"]);
  const respostaCpro = executarBin("cpro", ["--prompt", "olá"]);
  if (respostaCodingPro !== "Olá! Como posso ajudar?\n" || respostaCpro !== respostaCodingPro) {
    throw new Error("Os bins instalados não reproduziram o prompt esperado.");
  }

  const erro = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["--inexistente"],
    { encoding: "utf8", env: ambienteCli },
  );
  if (erro.status !== 1 || !erro.stderr.includes("erro: opção desconhecida")) {
    throw new Error(`Erro inesperado do pacote: status=${erro.status}, stderr=${erro.stderr}`);
  }

  const promptAusente = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["-p"],
    { encoding: "utf8", env: ambienteCli },
  );
  if (promptAusente.status !== 1 || !promptAusente.stderr.includes("exige um argumento")) {
    throw new Error(
      `Erro inesperado para prompt ausente: status=${promptAusente.status}, stderr=${promptAusente.stderr}`,
    );
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
