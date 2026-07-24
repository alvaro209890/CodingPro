import type { PermissionRequest } from "@codingpro/core";
import type { ChatMessage, CostBreakdown } from "@codingpro/llm";
import { Box, Text, useInput } from "ink";
import Gradient from "ink-gradient";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { useCallback, useState } from "react";
import { Bolha } from "./componentes.js";
import { type Tema, TEMAS } from "./tema.js";

export type TuiProps = {
  tema?: string;
  onSend: (prompt: string) => Promise<readonly ChatMessage[]>;
  onApprove?: (req: PermissionRequest, approved: boolean) => void;
  historicoInicial?: readonly ChatMessage[];
};

export function App({ tema: nomeTema = "aurora", onSend, onApprove, historicoInicial = [] }: TuiProps) {
  const tema = (TEMAS[nomeTema] ?? TEMAS.aurora)!;
  const [mensagens, setMensagens] = useState<ChatMessage[]>(() => [...historicoInicial]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [custo, setCusto] = useState<CostBreakdown>();
  const [pendente, setPendente] = useState<PermissionRequest | null>(null);

  const enviar = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || enviando) return;
    setInput("");
    setEnviando(true);
    setMensagens((prev) => [...prev, { role: "user" as const, content: prompt } satisfies ChatMessage]);
    try {
      const resposta = await onSend(prompt);
      setMensagens((prev) => [...prev, ...resposta]);
    } catch (erro: unknown) {
      setMensagens((prev) => [
        ...prev,
        { role: "assistant" as const, content: `Erro: ${erro instanceof Error ? erro.message : "falha"}` } satisfies ChatMessage,
      ]);
    } finally {
      setEnviando(false);
    }
  }, [input, enviando, onSend]);

  useInput((tecla, key) => {
    if (pendente && onApprove) {
      if (tecla === "y" || tecla === "a") { onApprove(pendente, true); setPendente(null); }
      else if (tecla === "n" || tecla === "r") { onApprove(pendente, false); setPendente(null); }
      return;
    }
    if (key.return && !enviando) enviar();
  });

  return (
    <Box flexDirection="column" padding={1} minHeight={30}>
      <Gradient name="summer"><Text bold>⚡ CodingPro</Text></Gradient>
      {enviando && <Spinner type="dots" />}
      {custo && (
        <Text dimColor>US$ {custo.totalCostUsd.toFixed(4)} · {custo.inputTokens + custo.outputTokens} tokens</Text>
      )}
      <Box flexDirection="column" marginY={1} minHeight={20}>
        {mensagens.slice(-30).map((msg, i) => (
          <Bolha key={i} msg={msg} tema={tema} />
        ))}
      </Box>
      {pendente && (
        <Box borderStyle="round" borderColor={tema.aviso} padding={1} marginY={1}>
          <Text color={tema.aviso} bold>⚠ {pendente.toolName}</Text>
          <Text color={tema.suave}> [Y] Aprovar  [N] Negar</Text>
        </Box>
      )}
      <Box>
        <Text color={tema.primaria} bold>▸ </Text>
        {enviando ? (
          <Text dimColor>Pensando…</Text>
        ) : (
          <TextInput onChange={setInput} onSubmit={enviar} placeholder="Pergunte algo…" value={input} />
        )}
      </Box>
    </Box>
  );
}
