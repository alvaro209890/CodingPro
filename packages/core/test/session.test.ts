import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage } from "@codingpro/llm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newSessionId, SessionStore } from "../src/session.js";
import { cleanup, makeTmpRoot } from "./tmp.js";

const transcript: ChatMessage[] = [
  { content: "sistema", role: "system" },
  { content: "oi", role: "user" },
  {
    content: "",
    role: "assistant",
    toolCalls: [{ id: "c1", input: { path: "a.txt" }, name: "read_file" }],
  },
  {
    result: { type: "text", value: "conteúdo" },
    role: "tool",
    toolCallId: "c1",
    toolName: "read_file",
  },
  { content: "pronto", role: "assistant" },
];

describe("SessionStore", () => {
  let dir: string;
  let sessionsDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    dir = await makeTmpRoot();
    sessionsDir = join(dir, "sessions");
    store = await SessionStore.create(sessionsDir);
  });

  afterEach(async () => {
    await cleanup(dir);
  });

  it("salva e recarrega um transcrito completo", async () => {
    const id = newSessionId();
    expect(await store.has(id)).toBe(false);
    await store.save(id, transcript);
    expect(await store.has(id)).toBe(true);
    expect(await store.load(id)).toEqual(transcript);
  });

  it("acumula mensagens por append e recarrega na ordem", async () => {
    const id = "sessao-append";
    for (const message of transcript) {
      await store.append(id, message);
    }
    expect(await store.load(id)).toEqual(transcript);
  });

  it("regrava por save (transcrito vazio zera o arquivo)", async () => {
    const id = "sessao-vazia";
    await store.save(id, transcript);
    await store.save(id, []);
    expect(await store.load(id)).toEqual([]);
  });

  it("lista as sessões ordenadas, ignorando arquivos estranhos", async () => {
    await store.save("bbb", transcript);
    await store.save("aaa", transcript);
    await writeFile(join(sessionsDir, "nota.txt"), "x");
    await writeFile(join(sessionsDir, "..oculto.jsonl"), "x");
    expect(await store.list()).toEqual(["aaa", "bbb"]);
  });

  it("falha fechado ao ler sessão inexistente", async () => {
    await expect(store.load("nao-existe")).rejects.toMatchObject({ code: "not-found" });
  });

  it("falha fechado em JSON corrompido e em objeto que não é mensagem", async () => {
    await writeFile(join(sessionsDir, "quebrada.jsonl"), "{não é json}\n");
    await expect(store.load("quebrada")).rejects.toMatchObject({ code: "invalid-input" });

    await writeFile(join(sessionsDir, "estranha.jsonl"), '{"role":"outro"}\n');
    await expect(store.load("estranha")).rejects.toMatchObject({ code: "invalid-input" });
  });

  it.each(["", "../fuga", "com/barra", "a".repeat(129)])("rejeita id inseguro %j", async (id) => {
    await expect(store.append(id, transcript[1] as ChatMessage)).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("recusa mensagem inválida no append", async () => {
    await expect(
      store.append("valida", { role: "fantasma" } as unknown as ChatMessage),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("recusa diretório de sessões inválido", async () => {
    await expect(SessionStore.create("")).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("newSessionId produz ids únicos e seguros como nome de arquivo", () => {
    const a = newSessionId(new Date("2026-07-22T18:20:00.000Z"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{1,128}$/u);
    expect(newSessionId()).not.toBe(newSessionId());
  });
});
