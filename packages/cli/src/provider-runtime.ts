import {
  DEFAULT_MODEL_ROLE,
  DeepSeekProvider,
  loadReplayProvider,
  type ModelRole,
  type Provider,
  ProviderError,
  parseModelRole,
  parseReplayProvider,
} from "@codingpro/llm";
import { loadConfig, type ProviderOverrides, type RuntimeEnvironment } from "./config.js";
import { API_PADRAO, lerCredenciais } from "./conta.js";

export type { RuntimeEnvironment } from "./config.js";

export interface ProviderRuntimeContext {
  readonly cwd: string;
  readonly environment: RuntimeEnvironment;
  readonly flags: ProviderOverrides;
  readonly homeDirectory: string;
  /**
   * Papel interno de produto para o DeepSeek (`auto`|`main`|`fast`).
   * Padrão `auto` → Pro (tráfego de codificação headless).
   * Caminhos mecânicos futuros passam `fast` explicitamente.
   */
  readonly role?: ModelRole;
}

function tokenCloudDoAmbiente(env: RuntimeEnvironment): { token: string; apiUrl: string } | null {
  const token = env.CODINGPRO_TOKEN?.trim();
  if (!token?.startsWith("cp_")) return null;
  const apiUrl = (env.CODINGPRO_API_URL?.trim() || API_PADRAO).replace(/\/+$/u, "");
  return { apiUrl, token };
}

export async function criarProviderRuntime(
  context: ProviderRuntimeContext,
  signal?: AbortSignal,
): Promise<Provider> {
  signal?.throwIfAborted();
  const config = await loadConfig({ ...context, ...(signal === undefined ? {} : { signal }) });
  signal?.throwIfAborted();

  const apiKey = context.environment.DEEPSEEK_API_KEY;
  const temChavePropria = apiKey !== undefined && apiKey.trim().length > 0;

  // Modo cloud: com uma conta conectada via `codingpro login`, o token `cp_` substitui a
  // chave DeepSeek e o tráfego passa pelo proxy da plataforma. O provider continua sendo o
  // DeepSeek e a allowlist Pro/Flash continua valendo — muda só a base e a credencial.
  //
  // Uma DEEPSEEK_API_KEY própria tem prioridade: quem já paga a própria chave não deve ser
  // empurrado para a cota da plataforma sem pedir. E quando o provider não foi escolhido em
  // lugar nenhum, ter uma conta conectada já é escolha suficiente — obrigar a mexer no
  // settings depois do `login` seria um segundo passo sem propósito.
  //
  // Precedência cloud: CODINGPRO_TOKEN (env) → ~/.codingpro/credenciais.json
  if (!temChavePropria && (config.provider === "deepseek" || config.provider === undefined)) {
    const doEnv = tokenCloudDoAmbiente(context.environment);
    if (doEnv) {
      signal?.throwIfAborted();
      return new DeepSeekProvider({
        apiKey: doEnv.token,
        baseUrl: `${doEnv.apiUrl}/v1`,
        role: context.role === undefined ? DEFAULT_MODEL_ROLE : parseModelRole(context.role),
      });
    }
    const credenciais = await lerCredenciais(context.homeDirectory);
    if (credenciais) {
      signal?.throwIfAborted();
      return new DeepSeekProvider({
        apiKey: credenciais.token,
        baseUrl: `${credenciais.apiUrl}/v1`,
        role: context.role === undefined ? DEFAULT_MODEL_ROLE : parseModelRole(context.role),
      });
    }
    if (config.provider === "deepseek") {
      throw new ProviderError(
        "not-configured",
        "Nenhuma conta conectada. Rode `codingpro login` para entrar com sua conta do site, " +
          "ou defina DEEPSEEK_API_KEY para usar sua própria chave DeepSeek.",
      );
    }
  }

  if (config.provider === "deepseek") {
    const role = context.role === undefined ? DEFAULT_MODEL_ROLE : parseModelRole(context.role);
    return new DeepSeekProvider({ apiKey: apiKey as string, role });
  }

  if (config.provider !== "replay") {
    throw new ProviderError(
      "not-configured",
      "Selecione deepseek ou replay no settings, CODINGPRO_PROVIDER ou --provider.",
    );
  }

  if (config.replayContent !== undefined) {
    return parseReplayProvider(config.replayContent);
  }
  return loadReplayProvider(config.replayFile, signal === undefined ? undefined : { signal });
}
