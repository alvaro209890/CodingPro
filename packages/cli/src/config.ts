import { constants, type Stats } from "node:fs";
import { type FileHandle, lstat, open, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { type Node as JsonNode, type ParseError, parseTree } from "jsonc-parser/lib/esm/main.js";

const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_PROJECT_REPLAY_BYTES = 16 * 1024 * 1024;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type ProviderName = "deepseek" | "replay";

export interface ProviderOverrides {
  readonly provider?: string;
  readonly replayFile?: string;
}

export interface RuntimeEnvironment {
  readonly [name: string]: string | undefined;
}

export interface LoadConfigOptions {
  readonly cwd: string;
  readonly environment: RuntimeEnvironment;
  readonly flags: ProviderOverrides;
  readonly homeDirectory: string;
  readonly signal?: AbortSignal;
}

export type ResolvedConfig =
  | Readonly<{ provider: "replay"; replayContent?: string; replayFile: string }>
  | Readonly<{ provider: "deepseek"; replayFile?: string }>
  | Readonly<{ provider?: undefined; replayFile?: string }>;

export class ConfigError extends Error {
  override readonly name = "ConfigError";

  constructor(
    readonly safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
  }
}

type LayerName = "global" | "projeto";

interface ReplaySetting {
  readonly path: string;
  readonly restrictedRoot?: string;
}

interface ConfigLayer {
  readonly provider?: ProviderName;
  readonly replayFile?: ReplaySetting;
}

function layerLabel(layer: LayerName): string {
  return layer === "global" ? "global" : "do projeto";
}

function invalidConfig(layer: LayerName, detail: string, options?: ErrorOptions): ConfigError {
  return new ConfigError(`Configuração ${layerLabel(layer)} inválida: ${detail}`, options);
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

function rethrowAbort(cause: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if ((cause instanceof Error || cause instanceof DOMException) && cause.name === "AbortError") {
    throw cause;
  }
}

function propertiesOf(node: JsonNode, layer: LayerName, allowed: ReadonlySet<string>) {
  if (node.type !== "object") {
    throw invalidConfig(layer, "a raiz deve ser um objeto.");
  }

  const result = new Map<string, JsonNode>();
  for (const property of node.children ?? []) {
    const keyNode = property.children?.[0];
    const valueNode = property.children?.[1];
    const key = keyNode?.value;
    if (property.type !== "property" || typeof key !== "string" || valueNode === undefined) {
      throw invalidConfig(layer, "a estrutura do objeto é inválida.");
    }
    if (DANGEROUS_KEYS.has(key) || !allowed.has(key)) {
      throw invalidConfig(layer, "contém um campo desconhecido ou proibido.");
    }
    if (result.has(key)) {
      throw invalidConfig(layer, "contém um campo duplicado.");
    }
    result.set(key, valueNode);
  }
  return result;
}

function stringValue(
  node: JsonNode | undefined,
  layer: LayerName,
  field: string,
): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (node.type !== "string" || typeof node.value !== "string" || node.value.trim().length === 0) {
    throw invalidConfig(layer, `o campo ${field} deve ser uma string não vazia.`);
  }
  return node.value;
}

function stringArrayValue(node: JsonNode | undefined, layer: LayerName, field: string): void {
  if (node === undefined) {
    return;
  }
  if (node.type !== "array") {
    throw invalidConfig(layer, `o campo ${field} deve ser uma lista de strings.`);
  }
  for (const child of node.children ?? []) {
    if (
      child.type !== "string" ||
      typeof child.value !== "string" ||
      child.value.trim().length === 0
    ) {
      throw invalidConfig(layer, `o campo ${field} deve conter apenas strings não vazias.`);
    }
  }
}

function providerValue(value: string | undefined, label: string): ProviderName | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "deepseek" && value !== "replay") {
    throw new ConfigError(`${label} deve ser deepseek ou replay.`);
  }
  return value;
}

function parseConfig(
  content: string,
  layer: LayerName,
  replayBase: string,
  projectRoot?: string,
): ConfigLayer {
  const errors: ParseError[] = [];
  const tree = parseTree(content.replace(/^\uFEFF/u, ""), errors, {
    allowEmptyContent: false,
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (tree === undefined || errors.length > 0) {
    throw invalidConfig(layer, "o JSONC está malformado.");
  }

  // `attribution`, `theme` e `pet` são consumidos por outros runtimes (atribuição/tema/pet);
  // aqui só precisam ser tolerados para não invalidarem a carga do provider.
  const root = propertiesOf(
    tree,
    layer,
    new Set(["attribution", "permissions", "pet", "provider", "replay", "theme", "version"]),
  );
  const versionNode = root.get("version");
  if (versionNode !== undefined && (versionNode.type !== "number" || versionNode.value !== 1)) {
    throw invalidConfig(layer, "a versão deve ser 1.");
  }

  const providerRaw = stringValue(root.get("provider"), layer, "provider");
  const provider = providerValue(providerRaw, `O provider da configuração ${layerLabel(layer)}`);
  if (layer === "projeto" && provider === "deepseek") {
    throw invalidConfig(layer, "um projeto não pode ativar o provider DeepSeek.");
  }

  let replayFile: ReplaySetting | undefined;
  const replayNode = root.get("replay");
  if (replayNode !== undefined) {
    const replay = propertiesOf(replayNode, layer, new Set(["file"]));
    const file = stringValue(replay.get("file"), layer, "replay.file");
    if (file === undefined) {
      throw invalidConfig(layer, "replay.file é obrigatório quando replay é definido.");
    }
    if (projectRoot !== undefined && isAbsolute(file)) {
      throw invalidConfig(layer, "replay.file deve ser relativo ao projeto.");
    }
    const resolvedPath = resolve(replayBase, file);
    if (projectRoot !== undefined && !isWithin(projectRoot, resolvedPath)) {
      throw invalidConfig(layer, "replay.file deve permanecer dentro do projeto.");
    }
    replayFile = {
      path: resolvedPath,
      ...(projectRoot === undefined ? {} : { restrictedRoot: projectRoot }),
    };
  }

  const permissionsNode = root.get("permissions");
  if (permissionsNode !== undefined) {
    const permissions = propertiesOf(permissionsNode, layer, new Set(["allowlist"]));
    stringArrayValue(permissions.get("allowlist"), layer, "permissions.allowlist");
  }

  return {
    ...(provider === undefined ? {} : { provider }),
    ...(replayFile === undefined ? {} : { replayFile }),
  };
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function canonicalDirectory(path: string, label: string): Promise<string> {
  try {
    const canonical = await realpath(path);
    if (!(await stat(canonical)).isDirectory()) {
      throw new ConfigError(`${label} não é um diretório.`);
    }
    return canonical;
  } catch (cause) {
    if (cause instanceof ConfigError) {
      throw cause;
    }
    throw new ConfigError(`Não foi possível acessar ${label}.`, { cause });
  }
}

async function readOptionalConfig(
  path: string,
  layer: LayerName,
  allowedRoot: string,
  replayBase: string,
  signal?: AbortSignal,
  projectRoot?: string,
): Promise<ConfigLayer | undefined> {
  signal?.throwIfAborted();
  const directory = dirname(path);
  let directoryMetadata: Stats;
  try {
    directoryMetadata = await lstat(directory);
  } catch (cause) {
    rethrowAbort(cause, signal);
    if (isNodeError(cause, "ENOENT")) {
      signal?.throwIfAborted();
      return undefined;
    }
    throw invalidConfig(layer, "não foi possível validar o diretório.", { cause });
  }

  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw invalidConfig(layer, "o diretório de configuração não é seguro.");
  }

  let candidateMetadata: Stats;
  try {
    candidateMetadata = await lstat(path);
  } catch (cause) {
    rethrowAbort(cause, signal);
    if (isNodeError(cause, "ENOENT")) {
      signal?.throwIfAborted();
      return undefined;
    }
    throw invalidConfig(layer, "não foi possível verificar o arquivo.", { cause });
  }

  try {
    if (process.platform !== "win32" && (directoryMetadata.mode & 0o022) !== 0) {
      throw invalidConfig(layer, "o diretório permite escrita por outros usuários.");
    }
    const canonicalDirectoryPath = await realpath(directory);
    if (!isWithin(allowedRoot, canonicalDirectoryPath)) {
      throw invalidConfig(layer, "o diretório está fora do escopo permitido.");
    }
  } catch (cause) {
    rethrowAbort(cause, signal);
    if (cause instanceof ConfigError) {
      throw cause;
    }
    throw invalidConfig(layer, "não foi possível validar o diretório.", { cause });
  }

  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    rethrowAbort(cause, signal);
    throw invalidConfig(layer, "não foi possível abrir o arquivo com segurança.", { cause });
  }

  try {
    signal?.throwIfAborted();
    const before = await handle.stat();
    const directoryAfterOpen = await lstat(directory);
    if (
      directoryMetadata.dev !== directoryAfterOpen.dev ||
      directoryMetadata.ino !== directoryAfterOpen.ino ||
      directoryAfterOpen.isSymbolicLink() ||
      candidateMetadata.dev !== before.dev ||
      candidateMetadata.ino !== before.ino ||
      !before.isFile() ||
      before.nlink !== 1
    ) {
      throw invalidConfig(layer, "o caminho não é um arquivo regular exclusivo.");
    }
    if (before.size > MAX_CONFIG_BYTES) {
      throw invalidConfig(layer, "o arquivo excede 64 KiB.");
    }
    if (process.platform !== "win32") {
      if ((before.mode & 0o022) !== 0) {
        throw invalidConfig(layer, "o arquivo permite escrita por outros usuários.");
      }
      if (layer === "global" && process.getuid !== undefined && before.uid !== process.getuid()) {
        throw invalidConfig(layer, "o arquivo pertence a outro usuário.");
      }
    }

    const content = await handle.readFile("utf8");
    const after = await handle.stat();
    signal?.throwIfAborted();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw invalidConfig(layer, "o arquivo mudou durante a leitura.");
    }
    return parseConfig(content, layer, replayBase, projectRoot);
  } finally {
    await handle.close();
  }
}

function applyLayer(
  current: { provider?: ProviderName; replayFile?: ReplaySetting },
  layer: ConfigLayer,
): void {
  if (layer.provider !== undefined) {
    current.provider = layer.provider;
  }
  if (layer.replayFile !== undefined) {
    current.replayFile = layer.replayFile;
  }
}

function nonEmptyOverride(value: string | undefined, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new ConfigError(`${label} não pode estar vazio.`);
  }
  return value;
}

interface DirectorySnapshot {
  readonly dev: number;
  readonly ino: number;
  readonly path: string;
}

async function snapshotDirectories(
  root: string,
  targetDirectory: string,
  signal?: AbortSignal,
): Promise<readonly DirectorySnapshot[]> {
  if (!isWithin(root, targetDirectory)) {
    throw new ConfigError("A fixture de replay do projeto está fora do projeto.");
  }
  const relativeDirectory = relative(root, targetDirectory);
  const paths = [root];
  let current = root;
  for (const component of relativeDirectory.split(sep).filter((value) => value.length > 0)) {
    current = join(current, component);
    paths.push(current);
  }

  const snapshots: DirectorySnapshot[] = [];
  for (const path of paths) {
    signal?.throwIfAborted();
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new ConfigError("A fixture de replay do projeto atravessa um diretório inseguro.");
    }
    snapshots.push({ dev: metadata.dev, ino: metadata.ino, path });
  }
  return snapshots;
}

async function verifyDirectorySnapshots(
  snapshots: readonly DirectorySnapshot[],
  signal?: AbortSignal,
): Promise<void> {
  for (const snapshot of snapshots) {
    signal?.throwIfAborted();
    const metadata = await lstat(snapshot.path);
    if (
      metadata.dev !== snapshot.dev ||
      metadata.ino !== snapshot.ino ||
      !metadata.isDirectory() ||
      metadata.isSymbolicLink()
    ) {
      throw new ConfigError("Um diretório da fixture mudou durante a leitura.");
    }
  }
}

async function readProjectReplay(
  setting: ReplaySetting,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const root = setting.restrictedRoot;
  if (root === undefined) {
    return undefined;
  }
  signal?.throwIfAborted();
  if (!isWithin(root, setting.path)) {
    throw new ConfigError("A fixture de replay do projeto está fora do projeto.");
  }
  let handle: FileHandle | undefined;
  try {
    const directorySnapshots = await snapshotDirectories(root, dirname(setting.path), signal);
    const candidateMetadata = await lstat(setting.path);
    if (candidateMetadata.isSymbolicLink()) {
      throw new ConfigError("A fixture de replay do projeto não é um arquivo seguro.");
    }
    handle = await open(
      setting.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const before = await handle.stat();
    await verifyDirectorySnapshots(directorySnapshots, signal);
    signal?.throwIfAborted();
    if (
      candidateMetadata.dev !== before.dev ||
      candidateMetadata.ino !== before.ino ||
      !before.isFile() ||
      before.nlink !== 1
    ) {
      throw new ConfigError("A fixture de replay do projeto não é um arquivo seguro.");
    }
    if (before.size > MAX_PROJECT_REPLAY_BYTES) {
      throw new ConfigError("A fixture de replay do projeto excede 16 MiB.");
    }
    const content = await handle.readFile("utf8");
    const after = await handle.stat();
    await verifyDirectorySnapshots(directorySnapshots, signal);
    signal?.throwIfAborted();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs
    ) {
      throw new ConfigError("A fixture de replay do projeto mudou durante a leitura.");
    }
    return content;
  } catch (cause) {
    rethrowAbort(cause, signal);
    if (cause instanceof ConfigError) {
      throw cause;
    }
    throw new ConfigError("Não foi possível ler a fixture de replay do projeto.", { cause });
  } finally {
    await handle?.close();
  }
}

export async function loadConfig(options: LoadConfigOptions): Promise<ResolvedConfig> {
  options.signal?.throwIfAborted();
  const [cwd, homeDirectory] = await Promise.all([
    canonicalDirectory(options.cwd, "o diretório atual"),
    canonicalDirectory(options.homeDirectory, "o diretório pessoal"),
  ]);
  options.signal?.throwIfAborted();

  const globalPath = join(homeDirectory, ".codingpro", "settings.json");
  const projectPath = join(cwd, ".codingpro", "settings.json");
  const global = await readOptionalConfig(
    globalPath,
    "global",
    homeDirectory,
    dirname(globalPath),
    options.signal,
  );
  options.signal?.throwIfAborted();
  const project =
    projectPath === globalPath
      ? undefined
      : await readOptionalConfig(projectPath, "projeto", cwd, cwd, options.signal, cwd);
  options.signal?.throwIfAborted();

  const resolved: { provider?: ProviderName; replayFile?: ReplaySetting } = {};
  if (global !== undefined) {
    applyLayer(resolved, global);
  }
  if (project !== undefined) {
    applyLayer(resolved, project);
  }

  const environmentProvider = providerValue(
    nonEmptyOverride(options.environment.CODINGPRO_PROVIDER, "CODINGPRO_PROVIDER"),
    "CODINGPRO_PROVIDER",
  );
  const environmentReplay = nonEmptyOverride(
    options.environment.CODINGPRO_REPLAY_FILE,
    "CODINGPRO_REPLAY_FILE",
  );
  if (environmentProvider !== undefined) {
    resolved.provider = environmentProvider;
  }
  if (environmentReplay !== undefined) {
    resolved.replayFile = { path: resolve(cwd, environmentReplay) };
  }

  const flagProvider = providerValue(
    nonEmptyOverride(options.flags.provider, "--provider"),
    "--provider",
  );
  const flagReplay = nonEmptyOverride(options.flags.replayFile, "--replay-file");
  if (flagProvider !== undefined) {
    resolved.provider = flagProvider;
  }
  if (flagReplay !== undefined) {
    resolved.replayFile = { path: resolve(cwd, flagReplay) };
  }

  if (resolved.provider === "replay") {
    if (resolved.replayFile === undefined) {
      throw new ConfigError("O provider replay exige replay.file ou --replay-file.");
    }
    const replayContent = await readProjectReplay(resolved.replayFile, options.signal);
    return Object.freeze({
      provider: "replay",
      replayFile: resolved.replayFile.path,
      ...(replayContent === undefined ? {} : { replayContent }),
    });
  }
  return Object.freeze({
    ...(resolved.provider === undefined ? {} : { provider: resolved.provider }),
    ...(resolved.replayFile === undefined ? {} : { replayFile: resolved.replayFile.path }),
  });
}
