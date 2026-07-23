import React from "react";
import { Text, Box } from "ink";
import { aurora } from "../tema.js";

export interface BlocoMensagem {
  tipo: "user" | "agent" | "tool";
  texto: string;
  detalhes?: string;
  /** Se a tool ainda está executando (spinner). */
  ativo?: boolean;
  /** Para tool results: ✅ sucesso ou ❌ erro. */
  ok?: boolean;
}

export function Timeline({
  mensagens,
  streaming,
  eventoAtual,
}: {
  mensagens: readonly BlocoMensagem[];
  streaming?: string | undefined;
  eventoAtual?: string | undefined;
}) {
  return (
    <Box flexDirection="column">
      {mensagens.map((msg, i) => (
        <Bloco key={`${i}`} msg={msg} />
      ))}
      {streaming !== undefined && streaming.length > 0 && (
        <BlocoAgent texto={streaming} />
      )}
      {eventoAtual !== undefined && (
        <Text color={aurora.textoMuted}>
          {"  │ "}{eventoAtual}
        </Text>
      )}
    </Box>
  );
}

function Bloco({ msg }: { key?: React.Key; msg: BlocoMensagem }) {
  switch (msg.tipo) {
    case "user":
      return <BlocoUser texto={msg.texto} />;
    case "agent":
      return <BlocoAgent texto={msg.texto} />;
    case "tool":
      return <BlocoTool msg={msg} />;
  }
}

function BlocoUser({ texto }: { texto: string }) {
  return (
    <Box>
      <Text color={aurora.primario}>◆ </Text>
      <Text>{texto}</Text>
    </Box>
  );
}

function BlocoAgent({ texto }: { texto: string }) {
  return (
    <Box>
      <Text color={aurora.secundario}>{" │"}</Text>
      <Text> </Text>
      <Text>{texto}</Text>
    </Box>
  );
}

function BlocoTool({ msg }: { msg: BlocoMensagem }) {
  const icone = msg.ativo
    ? "●─"
    : msg.ok === true
      ? "✓─"
      : msg.ok === false
        ? "✗─"
        : "●─";
  const cor = msg.ok === false ? aurora.erro : aurora.textoMuted;

  return (
    <Box>
      <Text color={cor}>
        {icone} {msg.texto}
      </Text>
      {msg.detalhes !== undefined && (
        <Text color={aurora.textoMuted}> — {msg.detalhes}</Text>
      )}
    </Box>
  );
}
