import { DeepSeekProvider, loadReplayProvider, ProviderError, type Provider } from "@codingpro/llm";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export async function criarProviderRuntime(
  environment: RuntimeEnvironment,
  signal?: AbortSignal,
): Promise<Provider> {
  signal?.throwIfAborted();

  if (environment.CODINGPRO_PROVIDER === "deepseek") {
    const apiKey = environment.DEEPSEEK_API_KEY;
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new ProviderError(
        "not-configured",
        "Defina DEEPSEEK_API_KEY para usar o provider DeepSeek.",
      );
    }
    return new DeepSeekProvider({ apiKey });
  }

  if (environment.CODINGPRO_PROVIDER !== "replay") {
    throw new ProviderError("not-configured", "Defina CODINGPRO_PROVIDER como deepseek ou replay.");
  }

  const replayFile = environment.CODINGPRO_REPLAY_FILE;
  if (replayFile === undefined || replayFile.trim().length === 0) {
    throw new ProviderError(
      "not-configured",
      "Defina CODINGPRO_REPLAY_FILE para usar o provider de replay.",
    );
  }

  return loadReplayProvider(replayFile, signal === undefined ? undefined : { signal });
}
