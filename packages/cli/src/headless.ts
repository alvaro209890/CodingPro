import { stripVTControlCharacters } from "node:util";
import { type Provider, ProviderError } from "@codingpro/llm";

export function sanitizarTextoTerminal(texto: string): string {
  return Array.from(stripVTControlCharacters(texto))
    .filter((caractere) => {
      const codigo = caractere.codePointAt(0) ?? 0;
      return !(
        codigo <= 8 ||
        (codigo >= 11 && codigo <= 31) ||
        (codigo >= 127 && codigo <= 159) ||
        (codigo >= 0x202a && codigo <= 0x202e) ||
        (codigo >= 0x2066 && codigo <= 0x2069)
      );
    })
    .join("");
}

export async function executarPromptHeadless(
  prompt: string,
  provider: Provider,
  escrever: (texto: string) => void,
  signal?: AbortSignal,
): Promise<string> {
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
      const textoSeguro = sanitizarTextoTerminal(event.text);
      resposta += textoSeguro;
      escrever(textoSeguro);
    } else if (event.type === "tool-call") {
      throw new ProviderError("invalid-response", "O modo headless ainda não executa ferramentas.");
    } else if (event.type === "finish") {
      if (event.reason === "tool-calls" || event.message.toolCalls !== undefined) {
        throw new ProviderError(
          "invalid-response",
          "O modo headless ainda não executa ferramentas.",
        );
      }
      if (sanitizarTextoTerminal(event.message.content) !== resposta) {
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
  return resposta;
}
