// Servidor MCP fake para teste: JSON-RPC 2.0 delimitado por linha sobre stdio.
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });
const enviar = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

// Linha de log não-JSON no stdout: o cliente deve ignorá-la sem quebrar.
process.stdout.write("log: servidor MCP iniciando\n");

rl.on("line", (linha) => {
  const t = linha.trim();
  if (t.length === 0) return;
  let msg;
  try {
    msg = JSON.parse(t);
  } catch {
    return;
  }
  if (typeof msg.id !== "number") return; // notificações: sem resposta
  const modo = process.env.FAKE_MCP_MODE;
  if (modo === "fail-init" && msg.method === "initialize") {
    enviar({
      error: { code: -32000, message: "versão não suportada" },
      id: msg.id,
      jsonrpc: "2.0",
    });
    return;
  }
  if (modo === "fail-list" && msg.method === "tools/list") {
    enviar({ error: { code: -32000, message: "sem tools" }, id: msg.id, jsonrpc: "2.0" });
    return;
  }
  switch (msg.method) {
    case "initialize":
      enviar({
        id: msg.id,
        jsonrpc: "2.0",
        result: {
          capabilities: { tools: {} },
          protocolVersion: "2024-11-05",
          serverInfo: { name: "fake", version: "1.0.0" },
        },
      });
      // Notificação do servidor (sem id): o cliente deve ignorar.
      enviar({ jsonrpc: "2.0", method: "notifications/message", params: { level: "info" } });
      break;
    case "tools/list":
      enviar({
        id: msg.id,
        jsonrpc: "2.0",
        result: {
          tools: [
            {
              description: "ecoa o texto",
              inputSchema: { properties: { texto: { type: "string" } }, type: "object" },
              name: "echo",
            },
            { description: "sem schema", name: "noschema" }, // inputSchema ausente → fallback
            { name: "notext" }, // devolve conteúdo não-texto
          ],
        },
      });
      break;
    case "tools/call": {
      const texto = msg.params?.arguments?.texto ?? "";
      if (msg.params?.name === "boom") {
        enviar({ error: { code: -32000, message: "explodiu" }, id: msg.id, jsonrpc: "2.0" });
      } else if (msg.params?.name === "nocontent") {
        enviar({ id: msg.id, jsonrpc: "2.0", result: {} }); // sem campo content
      } else if (msg.params?.name === "noschema") {
        enviar({ id: msg.id, jsonrpc: "2.0", result: { content: [] } }); // conteúdo vazio
      } else if (msg.params?.name === "notext") {
        enviar({
          id: msg.id,
          jsonrpc: "2.0",
          result: { content: [{ data: "abc", type: "image" }] },
        });
      } else {
        enviar({
          id: msg.id,
          jsonrpc: "2.0",
          result: { content: [{ text: `echo: ${texto}`, type: "text" }] },
        });
      }
      break;
    }
    default:
      enviar({
        error: { code: -32601, message: "método desconhecido" },
        id: msg.id,
        jsonrpc: "2.0",
      });
  }
});
