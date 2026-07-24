import type { ChatMessage } from "@codingpro/llm";
import { Box, Text } from "ink";
import type { Tema } from "./tema.js";

function textoMsg(msg: ChatMessage): string {
  if (msg.role === "tool") return `[${msg.toolName}] ${JSON.stringify(msg.result).slice(0, 200)}`;
  return typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
}

export function Bolha({ msg, tema }: { msg: ChatMessage; tema: Tema }) {
  const corBorda = msg.role === "user" ? tema.secundaria : msg.role === "tool" ? tema.suave : tema.primaria;
  const rotulo = msg.role === "user" ? "Você" : msg.role === "tool" ? "Tool" : "CodingPro";

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={corBorda} bold>╭─ {rotulo}</Text>
      <Text color={msg.role === "tool" ? tema.suave : tema.texto}>
        {textoMsg(msg).slice(0, 1000)}
      </Text>
      <Text color={corBorda}>╰{"─".repeat(Math.min(40, textoMsg(msg).length))}</Text>
    </Box>
  );
}
