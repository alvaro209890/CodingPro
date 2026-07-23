import React from "react";
import { Box, Text } from "ink";
import { Banner } from "./componentes/Banner.js";
import { Timeline } from "./componentes/Timeline.js";
import type { BlocoMensagem } from "./componentes/Timeline.js";
import { StatusBar } from "./componentes/StatusBar.js";
import { AprovadorPromptBox } from "./aprovador.js";
import { resolverTema, type Tema, type NomeTema } from "./tema.js";
import type { PermissionRequest } from "@codingpro/core";
import type { ToolContext } from "@codingpro/core";
import { useInput } from "ink";

export interface AppProps {
  /** Nome do modelo ativo. */
  modelo?: string;
  /** Porcentagem de cache. */
  cache?: number;
  /** Custo formatado do último turno. */
  custo?: string;
  /** Mensagens da timeline. */
  mensagens?: readonly BlocoMensagem[];
  /** Texto sendo streamado no momento. */
  streaming?: string;
  /** Evento atual (tool em execução, etc). */
  eventoAtual?: string;
  /** Nome do tema ativo. */
  temaNome?: NomeTema;
  /** Aprovação pendente (quando não-nulo, bloqueia input). */
  aprovacaoPendente?: {
    request: PermissionRequest;
    contexto?: ToolContext;
  };
  /** Callback quando uma aprovação é resolvida. */
  onAprovacao?: (resultado: "approve-always" | "approve-once" | "deny") => void;
  /** Callback quando o usuário digita /tema. */
  onComando?: (comando: string) => void;
}

export function App({
  modelo = "—",
  cache,
  custo,
  mensagens = [],
  streaming,
  eventoAtual,
  passos = 0,
  temaNome = "aurora-escuro",
  aprovacaoPendente,
  onAprovacao,
  onComando,
}: AppProps) {
  const tema: Tema = resolverTema(temaNome);

  // Captura comandos do teclado
  useInput((_input: string, key: Record<string, boolean>) => {
    if (key.ctrl && key.c) {
      // Ctrl+C handled by process
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={0} paddingY={0}>
      {/* Banner */}
      <Box marginBottom={1}>
        <Banner />
      </Box>

      {/* Timeline de mensagens */}
      <Box flexDirection="column" marginBottom={1}>
        <Timeline
          mensagens={mensagens}
          streaming={streaming}
          eventoAtual={eventoAtual}
        />
      </Box>
      {aprovacaoPendente !== undefined && onAprovacao !== undefined && (
        <Box marginBottom={1}>
          <AprovadorPromptBox
            request={aprovacaoPendente.request}
            contexto={aprovacaoPendente.contexto}
            onResolve={onAprovacao}
          />
        </Box>
      )}

      {/* Status bar */}
      <Box>
        <StatusBar
          modelo={modelo}
          cache={cache}
          custo={custo}
          passos={passos}
        />
      </Box>

      {/* Input area hint */}
      {aprovacaoPendente === undefined && (
        <Box marginTop={1}>
          <Text color={tema.primario}>› </Text>
          <Text dimColor>digite sua mensagem ou /ajuda</Text>
        </Box>
      )}
    </Box>
  );
}
