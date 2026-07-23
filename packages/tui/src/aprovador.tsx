import React from "react";
import { Text, Box, useInput } from "ink";
import type { Approver, PermissionRequest } from "@codingpro/core";
import type { ToolContext } from "@codingpro/core";
import { resolverTema } from "./tema.js";
import type { Tema } from "./tema.js";

type Opcao = "sim" | "nao" | "sempre";

const OPCIOES: Opcao[] = ["sim", "nao", "sempre"];

const rotulos: Record<Opcao, string> = {
  sim: "Sim",
  nao: "Não",
  sempre: "Sempre",
};

/**
 * Componente Ink para aprovação visual.
 * Renderizado dentro do App, emite resolução via callback.
 */
export function AprovadorPromptBox({
  request,
  onResolve,
}: {
  request: PermissionRequest;
  contexto?: ToolContext;
  onResolve: (resultado: "approve-always" | "approve-once" | "deny") => void;
}) {
  const tema: Tema = resolverTema();
  const [selecionado, setSelecionado] = React.useState(0);

  useInput((_input: string, _key: Record<string, boolean>) => {
    // Nada — placeholder. O componente AprovadorPromptBox faz o input real.
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={tema.border}>
      <Text color={tema.textoMuted}>
        {`Permitir "${request.toolName}"?`}
      </Text>
      {request.input !== undefined && (
        <Text color={tema.textoMuted}>
          {JSON.stringify(request.input, null, 2).slice(0, 400)}
        </Text>
      )}
      <Box marginTop={1}>
        {OPCIOES.map((opcao: Opcao, i: number) => {
          const ativo = i === selecionado;
          return (
            <Box key={opcao} marginRight={2}>
              <Text color={ativo ? tema.primario : tema.textoMuted}>
                {ativo ? "▸" : " "}
              </Text>
              <Text bold={ativo} color={ativo ? tema.texto : tema.textoMuted}>
                {rotulos[opcao]}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text dimColor>
        Tab/← → navega · Enter confirma · s/n/a atalhos
      </Text>
    </Box>
  );
}

/**
 * Cria um aprovador que usa Ink — integrado ao App.
 * Por padrão nega (fallback seguro); o App injeta o callback real.
 */
export function criarAprovadorInk(_tema?: Tema): Approver {
  return {
    async request(
      _request: PermissionRequest,
      _context?: ToolContext,
    ): Promise<"approve-always" | "approve-once" | "deny"> {
      // Na prática, o App gerencia a fila de aprovações via um state global.
      // Este placeholder sempre nega; o runtime da TUI substitui por um
      // aprovador conectado ao estado React.
      return "deny";
    },
  };
}

export type { Opcao };
