import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ChatMessage, copyChatMessage, isChatMessage } from "@codingpro/llm";
import { CoreError } from "./errors.js";

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_SESSION_BYTES = 32 * 1_048_576; // 32 MiB por transcrito

function assertSafeId(id: string): void {
  if (typeof id !== "string" || !SESSION_ID.test(id)) {
    throw new CoreError("invalid-input", "O identificador de sessão é inválido.");
  }
}

/** Gera um id ordenável por tempo e seguro como nome de arquivo. */
export function newSessionId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/gu, "-");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function serialize(message: ChatMessage): string {
  if (!isChatMessage(message)) {
    throw new CoreError("invalid-input", "A mensagem da sessão é inválida.");
  }
  return JSON.stringify(copyChatMessage(message));
}

/**
 * Persistência de transcritos em JSONL (uma mensagem por linha), append-only.
 * Carga fail-closed: linha corrompida ou que não seja uma `ChatMessage` aborta a leitura.
 */
export class SessionStore {
  private constructor(private readonly dir: string) {}

  static async create(dir: string): Promise<SessionStore> {
    if (typeof dir !== "string" || dir.length === 0) {
      throw new CoreError("invalid-input", "O diretório de sessões é inválido.");
    }
    await mkdir(dir, { recursive: true });
    return new SessionStore(await realpath(dir));
  }

  private pathFor(id: string): string {
    assertSafeId(id);
    return join(this.dir, `${id}.jsonl`);
  }

  async append(id: string, message: ChatMessage): Promise<void> {
    await appendFile(this.pathFor(id), `${serialize(message)}\n`, "utf8");
  }

  /** Regrava o transcrito inteiro (sobrescreve). */
  async save(id: string, messages: readonly ChatMessage[]): Promise<void> {
    const body = messages.map(serialize).join("\n");
    await writeFile(this.pathFor(id), body.length === 0 ? "" : `${body}\n`, "utf8");
  }

  async has(id: string): Promise<boolean> {
    return (await this.list()).includes(id);
  }

  async load(id: string): Promise<ChatMessage[]> {
    const path = this.pathFor(id);
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch {
      throw new CoreError("not-found", "A sessão não existe.");
    }
    if (Buffer.byteLength(content, "utf8") > MAX_SESSION_BYTES) {
      throw new CoreError("too-large", "O transcrito da sessão é grande demais.");
    }
    const messages: ChatMessage[] = [];
    for (const [index, rawLine] of content.split(/\r?\n/u).entries()) {
      const line = rawLine.trim();
      if (line.length === 0) {
        continue;
      }
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new CoreError("invalid-input", `Sessão corrompida na linha ${index + 1}.`);
      }
      if (!isChatMessage(value)) {
        throw new CoreError("invalid-input", `Sessão corrompida na linha ${index + 1}.`);
      }
      messages.push(copyChatMessage(value));
    }
    return messages;
  }

  async list(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return [];
    }
    return entries
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => name.slice(0, -".jsonl".length))
      .filter((id) => SESSION_ID.test(id))
      .sort((left, right) => left.localeCompare(right));
  }
}
