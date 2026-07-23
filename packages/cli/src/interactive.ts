import {
  type Approver,
  describeToolCall,
  formatarPreviaDeEscrita,
  resolverPreviaDeEscrita,
} from "@codingpro/core";
import type { Tema } from "./tema.js";

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
  tema?: Tema,
): Approver {
  const alvoEstilizado = (texto: string): string =>
    tema === undefined ? texto : tema.aviso(texto);
  const recusa = tema === undefined ? "· ação recusada\n" : `${tema.progresso("ação recusada")}\n`;
  return {
    async request(request, context) {
      const alvo = describeToolCall({
        id: "",
        input: request.input ?? {},
        name: request.toolName,
      });
      // Prévia de diff antes de aprovar uma escrita (best-effort; nunca bloqueia).
      if (context?.workspace !== undefined) {
        const previa = await resolverPreviaDeEscrita(
          context.workspace,
          request.toolName,
          request.input ?? {},
        );
        const bloco = previa === undefined ? undefined : formatarPreviaDeEscrita(previa);
        if (bloco !== undefined) {
          escreverProgresso(`${bloco}\n`);
        }
      }
      const resposta = (
        await perguntador.pergunta(`Permitir ${alvoEstilizado(alvo)}? [s/N/sempre] `)
      )
        .trim()
        .toLowerCase();
      if (SEMPRE.has(resposta)) {
        return "approve-always";
      }
      if (SIM.has(resposta)) {
        return "approve-once";
      }
      escreverProgresso(recusa);
      return "deny";
    },
  };
}
