import {
  DeepSeekProvider,
  loadReplayProvider,
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
    return new DeepSeekProvider({ apiKey });
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
