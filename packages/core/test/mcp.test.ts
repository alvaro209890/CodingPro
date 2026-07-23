import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { McpClient, nomeMcpTool, toolsDoServidorMcp } from "../src/mcp.js";
import type { ToolContext } from "../src/tool.js";

const SERVER = fileURLToPath(new URL("./fixtures/fake-mcp-server.mjs", import.meta.url));

describe("McpClient", () => {
  let client: McpClient | undefined;

  afterEach(() => {
    client?.fechar();
    client = undefined;
  });

  it("conecta (ignorando log não-JSON e notificações), lista e chama tools", async () => {
    client = await McpClient.conectar("fake", { args: [SERVER], command: process.execPath });
    const defs = await client.listarTools();
    expect(defs.map((d) => d.name)).toEqual(["echo", "noschema", "notext"]);
    expect(await client.chamar("echo", { texto: "oi" })).toBe("echo: oi");
    // conteúdo não-texto → string vazia
    expect(await client.chamar("notext", {})).toBe("");
    // resultado sem campo content → string vazia
    expect(await client.chamar("nocontent", {})).toBe("");
  });

  it("aplica schema-fallback para tool sem inputSchema", async () => {
    client = await McpClient.conectar("fake", { args: [SERVER], command: process.execPath });
    const tools = await toolsDoServidorMcp(client);
    const noschema = tools.find((t) => t.definition.name === nomeMcpTool("fake", "noschema"));
    expect(noschema?.definition.inputSchema).toMatchObject({ type: "object" });
    const r = await noschema?.execute({}, {} as ToolContext);
    expect(r).toEqual({ type: "text", value: "(sem conteúdo)" });
  });

  it("propaga erro do servidor ao chamar", async () => {
    client = await McpClient.conectar("fake", { args: [SERVER], command: process.execPath });
    await expect(client.chamar("boom", { texto: "x" })).rejects.toThrow("explodiu");
  });

  it("expõe as tools como ExecutableTool com nome prefixado e efeito exec", async () => {
    client = await McpClient.conectar("fake", { args: [SERVER], command: process.execPath });
    const tools = await toolsDoServidorMcp(client);
    const echo = tools.find((t) => t.definition.name === nomeMcpTool("fake", "echo"));
    expect(echo?.sideEffect).toBe("exec");
    const r = await echo?.execute({ texto: "mundo" }, {} as ToolContext);
    expect(r).toEqual({ type: "text", value: "echo: mundo" });
  });

  it("a ExecutableTool devolve erro estruturado quando o servidor caiu", async () => {
    client = await McpClient.conectar("fake", { args: [SERVER], command: process.execPath });
    const tools = await toolsDoServidorMcp(client);
    const echo = tools.find((t) => t.definition.name === nomeMcpTool("fake", "echo"));
    client.fechar(); // derruba o servidor: a próxima chamada deve falhar de forma controlada
    const r = await echo?.execute({ texto: "x" }, {} as ToolContext);
    expect(r?.type).toBe("error-text");
  });

  it("recusa a conexão quando o initialize retorna erro", async () => {
    await expect(
      McpClient.conectar("fake", {
        args: [SERVER],
        command: process.execPath,
        env: { FAKE_MCP_MODE: "fail-init" },
      }),
    ).rejects.toThrow("initialize falhou");
  });

  it("propaga erro em tools/list", async () => {
    client = await McpClient.conectar("fake", {
      args: [SERVER],
      command: process.execPath,
      env: { FAKE_MCP_MODE: "fail-list" },
    });
    await expect(client.listarTools()).rejects.toThrow("sem tools");
  });

  it("rejeita pendências quando o stdin é destruído", async () => {
    client = await McpClient.conectar("fake", { args: [SERVER], command: process.execPath });
    (client as unknown as { filho: { stdin: { destroy(): void } } }).filho.stdin.destroy();
    await expect(client.chamar("echo", { texto: "x" })).rejects.toBeInstanceOf(Error);
  });

  it("nomeMcpTool prefixa servidor e tool", () => {
    expect(nomeMcpTool("srv", "t")).toBe("mcp__srv__t");
  });
});
