import { ProviderError, type Provider } from "@codingpro/llm";

export async function executarPromptHeadless(
  prompt: string,
  provider: Provider,
  escrever: (texto: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  let resposta = "";
  let finalizou = false;

  for await (const event of provider.stream(
    { messages: [{ content: prompt, role: "user" }] },
    signal === undefined ? undefined : { signal },
  )) {
    if (finalizou) {
      throw new ProviderError("invalid-response", "O provider enviou dados após finalizar.");
    }

    if (event.type === "text-delta") {
      resposta += event.text;
      escrever(event.text);
    } else if (event.type === "finish") {
      if (event.message.content !== resposta) {
        throw new ProviderError(
          "invalid-response",
          "A resposta final do provider é inconsistente.",
        );
      }
      finalizou = true;
    }
  }

  if (!finalizou) {
    throw new ProviderError("invalid-response", "O provider terminou sem finalizar a resposta.");
  }

  if (!resposta.endsWith("\n")) {
    escrever("\n");
  }
}
