import { loadReplayProvider, ProviderError, type Provider } from "@codingpro/llm";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export async function criarProviderRuntime(
  environment: RuntimeEnvironment,
  signal?: AbortSignal,
): Promise<Provider> {
  signal?.throwIfAborted();

  if (environment.CODINGPRO_PROVIDER !== "replay") {
    throw new ProviderError(
      "not-configured",
      "Nenhum provider real está configurado nesta etapa. Use o replay de desenvolvimento.",
    );
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
