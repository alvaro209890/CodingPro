import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
const ambienteFerramentas = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.endsWith("_API_KEY")),
);
ambienteFerramentas.NO_COLOR = "1";
const ambienteBaseCli = {
  COMSPEC: process.env.COMSPEC,
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
const ambienteCli = {
  ...ambienteBaseCli,
  CODINGPRO_PROVIDER: "replay",
  CODINGPRO_REPLAY_FILE: replayFile,
};

mkdirSync(homeIsolada, { recursive: true });
mkdirSync(xdgIsolado, { recursive: true });
function escreverFixture(path, resposta) {
  writeFileSync(
    path,
    `${JSON.stringify({
      events: [
        { text: resposta, type: "text-delta" },
        {
          message: { content: resposta, role: "assistant" },
          reason: "stop",
          type: "finish",
        },
      ],
      request: { messages: [{ content: "olá", role: "user" }] },
    })}\n`,
    "utf8",
  );
}

escreverFixture(replayFile, "Olá! Como posso ajudar?");

function executarBin(nome, argumentos, environment = ambienteCli, cwd = raiz) {
  return execFileSync(join(destinoInstalacao, "node_modules", ".bin", nome), argumentos, {
    cwd,
    encoding: "utf8",
    env: environment,
    timeout: 10_000,
  });
}

function validarBloqueioCi(nome, valor) {
  const resultado = spawnSync(process.execPath, [join(raiz, "scripts", "smoke-deepseek.mjs")], {
    encoding: "utf8",
    env: {
      [nome]: valor,
      CODINGPRO_REAL_SMOKE: "1",
      DEEPSEEK_API_KEY: "",
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
    },
    timeout: 10_000,
  });
  if (resultado.status !== 1 || resultado.stderr !== "Smoke DeepSeek recusado dentro de CI.\n") {
    throw new Error(`O smoke DeepSeek não bloqueou ${nome}=${valor}.`);
  }
}

function validarRecusaSmoke(env, stderrEsperado) {
  const resultado = spawnSync(process.execPath, [join(raiz, "scripts", "smoke-deepseek.mjs")], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, ...env },
    timeout: 10_000,
  });
  if (resultado.status !== 1 || resultado.stderr !== stderrEsperado) {
    throw new Error("O smoke DeepSeek não aplicou o gate esperado.");
  }
}

try {
  execFileSync("pnpm", ["--filter", "codingpro", "pack", "--pack-destination", destinoPacote], {
    cwd: raiz,
    env: ambienteFerramentas,
    stdio: "pipe",
    timeout: 30_000,
  });

  const pacote = join(destinoPacote, `codingpro-${manifesto.version}.tgz`);
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--offline", "--prefix", destinoInstalacao, pacote],
    { cwd: raiz, env: ambienteFerramentas, stdio: "pipe", timeout: 30_000 },
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

  const configGlobal = join(homeIsolada, ".codingpro");
  const projetoConfig = join(temporario, "projeto config");
  const projetoSemConfig = join(temporario, "projeto sem config");
  const fixtureGlobal = join(configGlobal, "global.jsonl");
  const fixtureProjeto = join(projetoConfig, "project.jsonl");
  const fixtureFlag = join(temporario, "flag.jsonl");
  mkdirSync(configGlobal, { mode: 0o700, recursive: true });
  mkdirSync(join(projetoConfig, ".codingpro"), { mode: 0o700, recursive: true });
  mkdirSync(projetoSemConfig, { recursive: true });
  escreverFixture(fixtureGlobal, "global");
  escreverFixture(fixtureProjeto, "projeto");
  escreverFixture(fixtureFlag, "flag");
  writeFileSync(
    join(configGlobal, "settings.json"),
    '{\n  // camada global\n  "provider": "replay",\n  "replay": { "file": "global.jsonl" },\n}\n',
    { mode: 0o600 },
  );
  writeFileSync(
    join(projetoConfig, ".codingpro", "settings.json"),
    '{ "provider": "replay", "replay": { "file": "project.jsonl" } }\n',
    { mode: 0o644 },
  );

  const respostaGlobal = executarBin("codingpro", ["-p", "olá"], ambienteBaseCli, projetoSemConfig);
  const respostaProjeto = executarBin("codingpro", ["-p", "olá"], ambienteBaseCli, projetoConfig);
  const respostaFlag = executarBin(
    "cpro",
    ["--provider", "replay", "--replay-file", fixtureFlag, "-p", "olá"],
    ambienteBaseCli,
    projetoConfig,
  );
  if (
    respostaGlobal !== "global\n" ||
    respostaProjeto !== "projeto\n" ||
    respostaFlag !== "flag\n"
  ) {
    throw new Error("A precedência global → projeto → flags falhou no pacote instalado.");
  }

  writeFileSync(join(configGlobal, "settings.json"), '{ "provider": "deepseek" }\n', {
    mode: 0o600,
  });
  const projetoVenceDeepSeekGlobal = executarBin(
    "codingpro",
    ["-p", "olá"],
    ambienteBaseCli,
    projetoConfig,
  );
  if (projetoVenceDeepSeekGlobal !== "projeto\n") {
    throw new Error("O provider replay do projeto não venceu o DeepSeek global.");
  }

  const settingsProjeto = join(projetoConfig, ".codingpro", "settings.json");
  writeFileSync(settingsProjeto, '{ "provider": "deepseek" }\n', { mode: 0o644 });
  const projetoTentouDeepSeek = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["-p", "olá"],
    { cwd: projetoConfig, encoding: "utf8", env: ambienteBaseCli, timeout: 10_000 },
  );
  if (
    projetoTentouDeepSeek.status !== 2 ||
    !projetoTentouDeepSeek.stderr.includes("não pode ativar o provider DeepSeek") ||
    projetoTentouDeepSeek.stderr.includes("DEEPSEEK_API_KEY")
  ) {
    throw new Error("O pacote não bloqueou DeepSeek vindo da configuração do projeto.");
  }

  const canaryConfig = "conteudo-config-nao-pode-vazar";
  writeFileSync(settingsProjeto, `{ "${canaryConfig}": `, { mode: 0o644 });
  const ajudaComConfigInvalida = executarBin(
    "codingpro",
    ["--ajuda"],
    ambienteBaseCli,
    projetoConfig,
  );
  if (!ajudaComConfigInvalida.includes("Uso: codingpro [opções]")) {
    throw new Error("A ajuda tentou carregar configuração inválida.");
  }
  const versaoComConfigInvalida = executarBin(
    "codingpro",
    ["--versao"],
    ambienteBaseCli,
    projetoConfig,
  );
  if (versaoComConfigInvalida.trim() !== manifesto.version) {
    throw new Error("A versão tentou carregar configuração inválida.");
  }
  const erroConfig = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["-p", "olá"],
    { cwd: projetoConfig, encoding: "utf8", env: ambienteBaseCli, timeout: 10_000 },
  );
  if (
    erroConfig.status !== 2 ||
    !erroConfig.stderr.includes("Configuração do projeto inválida") ||
    erroConfig.stderr.includes(canaryConfig)
  ) {
    throw new Error("O pacote não tratou configuração inválida de forma segura.");
  }

  const erro = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["--inexistente"],
    { encoding: "utf8", env: ambienteCli, timeout: 10_000 },
  );
  if (erro.status !== 1 || !erro.stderr.includes("erro: opção desconhecida")) {
    throw new Error(`Erro inesperado do pacote: status=${erro.status}, stderr=${erro.stderr}`);
  }

  const promptAusente = spawnSync(
    join(destinoInstalacao, "node_modules", ".bin", "codingpro"),
    ["-p"],
    { encoding: "utf8", env: ambienteCli, timeout: 10_000 },
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

  const dist = join(destinoInstalacao, "node_modules", "codingpro", "dist");
  for (const arquivo of readdirSync(dist).filter((nome) => nome.endsWith(".mjs"))) {
    const modulo = readFileSync(join(dist, arquivo), "utf8");
    const imports = [
      ...modulo.matchAll(/^import\s+(?:.*?\s+from\s+)?["']([^"']+)["'];?$/gmu),
      ...modulo.matchAll(/\bimport\(["']([^"']+)["']\)/gu),
    ];
    for (const match of imports) {
      const specifier = match[1];
      if (
        specifier !== undefined &&
        !specifier.startsWith("./") &&
        !specifier.startsWith("node:")
      ) {
        throw new Error(`O bundle manteve import externo: ${specifier}`);
      }
    }
  }

  for (const valor of ["true", "TRUE", "1", "yes"]) {
    validarBloqueioCi("CI", valor);
  }
  validarBloqueioCi("GITHUB_ACTIONS", "true");
  validarBloqueioCi("GITHUB_ACTIONS", "1");
  validarRecusaSmoke(
    {},
    "Smoke DeepSeek recusado: defina CODINGPRO_REAL_SMOKE=1 explicitamente.\n",
  );
  validarRecusaSmoke(
    { CODINGPRO_REAL_SMOKE: "1" },
    "Smoke DeepSeek recusado: DEEPSEEK_API_KEY não está definida.\n",
  );
} finally {
  // npm pode criar arquivos somente leitura em alguns ambientes; garante limpeza do fixture.
  chmodSync(temporario, 0o700);
  rmSync(temporario, { force: true, recursive: true });
}
