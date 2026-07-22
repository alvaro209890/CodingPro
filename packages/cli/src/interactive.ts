import { type Approver, describeToolCall } from "@codingpro/core";

/** Lê uma linha do usuário em resposta a um prompt (readline no runtime real). */
export interface Perguntador {
  pergunta(texto: string): Promise<string>;
}

const SIM = new Set(["s", "sim", "y", "yes"]);
const SEMPRE = new Set(["a", "sempre", "always"]);

/**
 * Aprovador interativo para ferramentas de efeito: mostra o que será feito e pergunta
 * `[s/N/sempre]`. Fail-closed — qualquer resposta que não seja sim/sempre nega.
 */
export function criarAprovadorInterativo(
  perguntador: Perguntador,
  escreverProgresso: (texto: string) => void,
): Approver {
  return {
    async request(request) {
      const alvo = describeToolCall({
        id: "",
        input: request.input ?? {},
        name: request.toolName,
      });
      const resposta = (await perguntador.pergunta(`Permitir "${alvo}"? [s/N/sempre] `))
        .trim()
        .toLowerCase();
      if (SEMPRE.has(resposta)) {
        return "approve-always";
      }
      if (SIM.has(resposta)) {
        return "approve-once";
      }
      escreverProgresso("· ação recusada\n");
      return "deny";
    },
  };
}
