import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfigError,
  type LoadConfigOptions,
  loadConfig,
  type ProviderOverrides,
  type RuntimeEnvironment,
} from "../src/config.js";

let temporary: string;
let homeDirectory: string;
let cwd: string;

beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), "codingpro-config-"));
  homeDirectory = join(temporary, "home com espaço");
  cwd = join(temporary, "projeto ç");
  await Promise.all([mkdir(homeDirectory), mkdir(cwd)]);
  [homeDirectory, cwd] = await Promise.all([realpath(homeDirectory), realpath(cwd)]);
});

afterEach(async () => {
  await rm(temporary, { force: true, recursive: true });
});

function options(
  environment: RuntimeEnvironment = {},
  flags: ProviderOverrides = {},
): LoadConfigOptions {
  return { cwd, environment, flags, homeDirectory };
}

async function writeSettings(layer: "global" | "project", content: string, mode = 0o600) {
  const directory =
    layer === "global" ? join(homeDirectory, ".codingpro") : join(cwd, ".codingpro");
  await mkdir(directory, { mode: 0o700, recursive: true });
  const path = join(directory, "settings.json");
  await writeFile(path, content, { mode });
  return path;
}

async function writeFixture(path: string) {
  await writeFile(
    path,
    `${JSON.stringify({
      events: [
        { text: "ok", type: "text-delta" },
        { message: { content: "ok", role: "assistant" }, reason: "stop", type: "finish" },
      ],
      request: { messages: [{ content: "teste", role: "user" }] },
    })}\n`,
    { mode: 0o600 },
  );
}

function abortOnSignalCheck(index: number): AbortSignal {
  const controller = new AbortController();
  const throwIfAborted = controller.signal.throwIfAborted.bind(controller.signal);
  let checks = 0;
  vi.spyOn(controller.signal, "throwIfAborted").mockImplementation(() => {
    checks += 1;
    if (checks === index) {
      controller.abort();
    }
    throwIfAborted();
  });
  return controller.signal;
}

describe("loadConfig", () => {
  it("retorna snapshot vazio e não cria arquivos quando as camadas estão ausentes", async () => {
    const result = await loadConfig(options());

    expect(result).toEqual({});
    expect(Object.isFrozen(result)).toBe(true);
    await expect(lstat(join(homeDirectory, ".codingpro"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(lstat(join(cwd, ".codingpro"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("aceita JSONC, BOM, comentário, trailing comma e versão 1 na camada global", async () => {
    await writeSettings(
      "global",
      '\uFEFF{\n  // escolha persistente do usuário\n  "version": 1,\n  "provider": "deepseek",\n}',
    );

    await expect(loadConfig(options())).resolves.toEqual({ provider: "deepseek" });
  });

  it("faz merge global, projeto, ambiente legado e flags por precedência", async () => {
    await mkdir(join(homeDirectory, ".codingpro"), { mode: 0o700 });
    await writeFixture(join(homeDirectory, ".codingpro", "global.jsonl"));
    await writeSettings(
      "global",
      '{ "version": 1, "provider": "replay", "replay": { "file": "global.jsonl" } }',
    );
    await writeFixture(join(cwd, "project.jsonl"));
    await writeSettings(
      "project",
      '{ "provider": "replay", "replay": { "file": "project.jsonl" } }',
    );

    await expect(loadConfig(options())).resolves.toMatchObject({
      provider: "replay",
      replayContent: expect.any(String),
      replayFile: join(cwd, "project.jsonl"),
    });
    await expect(
      loadConfig(options({ CODINGPRO_PROVIDER: "replay", CODINGPRO_REPLAY_FILE: "env.jsonl" })),
    ).resolves.toEqual({ provider: "replay", replayFile: join(cwd, "env.jsonl") });
    await expect(
      loadConfig(
        options(
          { CODINGPRO_PROVIDER: "replay", CODINGPRO_REPLAY_FILE: "env.jsonl" },
          { provider: "replay", replayFile: "flag.jsonl" },
        ),
      ),
    ).resolves.toEqual({ provider: "replay", replayFile: join(cwd, "flag.jsonl") });
  });

  it("resolve replay global relativamente a ~/.codingpro", async () => {
    await mkdir(join(homeDirectory, ".codingpro"), { mode: 0o700 });
    await writeFixture(join(homeDirectory, ".codingpro", "global.jsonl"));
    await writeSettings("global", '{ "provider": "replay", "replay": { "file": "global.jsonl" } }');

    await expect(loadConfig(options())).resolves.toEqual({
      provider: "replay",
      replayFile: join(homeDirectory, ".codingpro", "global.jsonl"),
    });
  });

  it("mantém snapshot da fixture do projeto depois que o arquivo é removido", async () => {
    const fixture = join(cwd, "project.jsonl");
    await writeFixture(fixture);
    await writeSettings(
      "project",
      '{ "provider": "replay", "replay": { "file": "project.jsonl" } }',
    );

    const result = await loadConfig(options());
    await rm(fixture);

    expect(result).toMatchObject({
      provider: "replay",
      replayContent: expect.stringContaining('"text":"ok"'),
      replayFile: fixture,
    });
  });

  it("permite que flag DeepSeek vença replay do projeto sem consultar a fixture", async () => {
    await writeSettings(
      "project",
      '{ "provider": "replay", "replay": { "file": "inexistente.jsonl" } }',
    );

    await expect(loadConfig(options({}, { provider: "deepseek" }))).resolves.toMatchObject({
      provider: "deepseek",
    });
  });

  it("não trata a chave DeepSeek isolada como seleção de provider", async () => {
    await expect(loadConfig(options({ DEEPSEEK_API_KEY: "canario" }))).resolves.toEqual({});
  });

  it("não relê a configuração global como projeto quando cwd é o diretório pessoal", async () => {
    cwd = homeDirectory;
    await writeSettings("global", '{ "provider": "deepseek" }');

    await expect(loadConfig(options())).resolves.toEqual({ provider: "deepseek" });
  });

  it("ignora configuração em ancestral e usa somente o cwd inicial", async () => {
    const nested = join(cwd, "sub", "diretorio");
    await mkdir(nested, { recursive: true });
    await writeSettings("project", '{ "provider": "replay", "replay": { "file": "x" } }');
    cwd = nested;

    await expect(loadConfig(options())).resolves.toEqual({});
  });

  it("rejeita projeto tentando ativar DeepSeek", async () => {
    await writeSettings("project", '{ "provider": "deepseek" }');

    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("não pode ativar"),
    });
  });

  it("tolera as chaves de UI (theme/pet/attribution) junto do provider", async () => {
    cwd = homeDirectory;
    await writeSettings(
      "global",
      '{ "provider": "deepseek", "theme": "neon", "pet": false, "attribution": "none" }',
    );

    await expect(loadConfig(options())).resolves.toEqual({ provider: "deepseek" });
  });

  it.each([
    ["JSONC malformado", '{ "provider":'],
    ["raiz array", "[]"],
    ["versão futura", '{ "version": 2 }'],
    ["provider inválido", '{ "provider": "outro" }'],
    ["provider vazio", '{ "provider": "" }'],
    ["campo desconhecido", '{ "apiKey": "segredo-canario" }'],
    ["campo perigoso", '{ "__proto__": { "polluted": true } }'],
    ["campo duplicado", '{ "provider": "replay", "provider": "replay" }'],
    ["replay não objeto", '{ "replay": "arquivo" }'],
    ["replay sem file", '{ "replay": {} }'],
    ["replay file inválido", '{ "replay": { "file": null } }'],
  ])("rejeita schema inválido: %s", async (_name, content) => {
    await writeSettings("global", content);

    const execution = loadConfig(options({}, { provider: "deepseek" }));
    await expect(execution).rejects.toBeInstanceOf(ConfigError);
    await expect(execution).rejects.toMatchObject({
      safeMessage: expect.not.stringContaining("segredo-canario"),
    });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it.each([
    [{ CODINGPRO_PROVIDER: "" }, {}, "CODINGPRO_PROVIDER"],
    [{ CODINGPRO_PROVIDER: "OUTRO" }, {}, "CODINGPRO_PROVIDER"],
    [{ CODINGPRO_REPLAY_FILE: "   " }, {}, "CODINGPRO_REPLAY_FILE"],
    [{}, { provider: "" }, "--provider"],
    [{}, { provider: "outro" }, "--provider"],
    [{}, { replayFile: "" }, "--replay-file"],
  ] satisfies Array<[RuntimeEnvironment, ProviderOverrides, string]>)(
    "rejeita override inválido em %s",
    async (environment, flags, label) => {
      await expect(loadConfig(options(environment, flags))).rejects.toMatchObject({
        safeMessage: expect.stringContaining(label),
      });
    },
  );

  it("exige replay.file depois do merge quando replay foi selecionado", async () => {
    await expect(loadConfig(options({}, { provider: "replay" }))).rejects.toMatchObject({
      safeMessage: expect.stringContaining("replay.file"),
    });
  });

  it.each(["/tmp/fora.jsonl", "../fora.jsonl"])(
    "rejeita fixture do projeto fora do escopo: %s",
    async (file) => {
      await writeSettings("project", JSON.stringify({ provider: "replay", replay: { file } }));

      await expect(loadConfig(options())).rejects.toBeInstanceOf(ConfigError);
    },
  );

  it("rejeita fixture do projeto ausente, symlink ou hardlink", async () => {
    const outside = join(temporary, "outside.jsonl");
    await writeFixture(outside);
    await writeSettings(
      "project",
      '{ "provider": "replay", "replay": { "file": "fixture.jsonl" } }',
    );

    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("ler a fixture"),
    });

    await symlink(outside, join(cwd, "fixture.jsonl"));
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("arquivo seguro"),
    });
    await rm(join(cwd, "fixture.jsonl"));
    await link(outside, join(cwd, "fixture.jsonl"));
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("arquivo seguro"),
    });
  });

  it("rejeita diretório e arquivo de configuração inseguros", async () => {
    const globalDirectory = join(homeDirectory, ".codingpro");
    await mkdir(globalDirectory, { mode: 0o700 });
    const settings = join(globalDirectory, "settings.json");
    await mkdir(settings);
    await expect(loadConfig(options())).rejects.toBeInstanceOf(ConfigError);

    if (process.platform === "win32") {
      return; // Permissões POSIX mode 0o622 não se aplicam ao NTFS do Windows
    }

    await rm(settings, { recursive: true });
    await writeFile(settings, '{ "provider": "deepseek" }', { mode: 0o622 });
    await chmod(settings, 0o622);
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("escrita por outros"),
    });
  });

  it("rejeita symlink no diretório ou arquivo de configuração", async () => {
    if (process.platform === "win32") {
      return; // Symlinks no Windows requerem Privilégio de Desenvolvedor
    }
    const realDirectory = join(homeDirectory, "real-config");
    await mkdir(realDirectory, { mode: 0o700 });
    await writeFile(join(realDirectory, "settings.json"), '{ "provider": "deepseek" }');
    await symlink(realDirectory, join(homeDirectory, ".codingpro"));
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("diretório de configuração"),
    });

    await rm(join(homeDirectory, ".codingpro"));
    await mkdir(join(homeDirectory, ".codingpro"), { mode: 0o700 });
    await symlink(
      join(realDirectory, "settings.json"),
      join(homeDirectory, ".codingpro", "settings.json"),
    );
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("abrir o arquivo"),
    });
  });

  it("rejeita hardlink e arquivo acima de 64 KiB", async () => {
    const source = join(temporary, "source.json");
    await writeFile(source, '{ "provider": "deepseek" }');
    const settings = await writeSettings("global", '{ "provider": "deepseek" }');
    await rm(settings);
    await link(source, settings);
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("arquivo regular exclusivo"),
    });

    await rm(settings);
    await writeFile(settings, `/*${"x".repeat(65 * 1024)}*/{}`);
    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("64 KiB"),
    });
  });

  it("rejeita diretório atual ou pessoal inválido", async () => {
    await expect(
      loadConfig({ ...options(), cwd: join(temporary, "ausente") }),
    ).rejects.toMatchObject({
      safeMessage: expect.stringContaining("diretório atual"),
    });

    const file = join(temporary, "arquivo");
    await writeFile(file, "x");
    await expect(loadConfig({ ...options(), homeDirectory: file })).rejects.toMatchObject({
      safeMessage: expect.stringContaining("diretório pessoal"),
    });
  });

  it("respeita AbortSignal antes de acessar o filesystem", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(loadConfig({ ...options(), signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it.each([
    [4, "durante o tratamento de ENOENT"],
    [5, "depois do ENOENT"],
    [10, "depois da camada de projeto"],
  ])("preserva cancelamento %s: %s", async (check) => {
    await expect(
      loadConfig({ ...options(), signal: abortOnSignalCheck(check) }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("mantém caminho explícito absoluto de env e flag", async () => {
    const explicit = resolve(temporary, "explicit.jsonl");
    await expect(
      loadConfig(
        options(
          { CODINGPRO_PROVIDER: "replay", CODINGPRO_REPLAY_FILE: explicit },
          { replayFile: explicit },
        ),
      ),
    ).resolves.toEqual({ provider: "replay", replayFile: explicit });
  });

  it("rejeita diretório de configuração gravável por outros usuários", async () => {
    if (process.platform === "win32") {
      return;
    }
    const directory = join(homeDirectory, ".codingpro");
    await mkdir(directory, { mode: 0o700 });
    await writeFile(join(directory, "settings.json"), '{ "provider": "deepseek" }');
    await chmod(directory, 0o733);

    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("diretório permite escrita"),
    });
  });

  it("ignora diretório inseguro quando settings.json não existe", async () => {
    const directory = join(homeDirectory, ".codingpro");
    await mkdir(directory, { mode: 0o733 });

    await expect(loadConfig(options())).resolves.toEqual({});
  });

  it("rejeita diretório de configuração simbólico mesmo sem settings.json", async () => {
    const target = join(temporary, "config-target-empty");
    await mkdir(target);
    await symlink(target, join(homeDirectory, ".codingpro"));

    await expect(loadConfig(options())).rejects.toMatchObject({
      safeMessage: expect.stringContaining("diretório de configuração não é seguro"),
    });
  });
});
