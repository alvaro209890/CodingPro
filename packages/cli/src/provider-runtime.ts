import {
  DEFAULT_MODEL_ROLE,
  DeepSeekProvider,
  loadReplayProvider,
  type ModelRole,
  parseModelRole,
  parseReplayProvider,
  ProviderError,
  type Provider,
} from "@codingpro/llm";
import { loadConfig, type ProviderOverrides, type RuntimeEnvironment } from "./config.js";

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

export async function criarProviderRuntime(
  context: ProviderRuntimeContext,
  signal?: AbortSignal,
): Promise<Provider> {
  signal?.throwIfAborted();
  const config = await loadConfig({ ...context, ...(signal === undefined ? {} : { signal }) });
  signal?.throwIfAborted();

  if (config.provider === "deepseek") {
    const apiKey = context.environment.DEEPSEEK_API_KEY;
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new ProviderError(
        "not-configured",
        "Defina DEEPSEEK_API_KEY para usar o provider DeepSeek.",
      );
    }
    const role = context.role === undefined ? DEFAULT_MODEL_ROLE : parseModelRole(context.role);
    return new DeepSeekProvider({ apiKey, role });
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
