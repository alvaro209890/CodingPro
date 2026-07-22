import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/**
 * Leitor de linhas robusto para stdin interativo OU em pipe. Usa os eventos `line`/`close`
 * do readline com uma fila, então nunca sofre o race de EOF do `readline/promises.question`
 * (que trava a partir da 2ª pergunta quando o pipe já terminou). Em EOF, `next` resolve
 * `undefined` — nunca fica pendente.
 */
export interface LineReader {
  close(): void;
  next(prompt: string): Promise<string | undefined>;
}

export function criarLeitorDeLinhas(input: Readable, output: Writable): LineReader {
  const ehTty = (input as Readable & { isTTY?: boolean }).isTTY === true;
  const rl = createInterface({ input, output, terminal: ehTty });
  const fila: string[] = [];
  const esperando: ((linha: string | undefined) => void)[] = [];
  let fechado = false;

  rl.on("line", (linha) => {
    const resolver = esperando.shift();
    if (resolver === undefined) {
      fila.push(linha);
    } else {
      resolver(linha);
    }
  });
  rl.on("close", () => {
    fechado = true;
    while (esperando.length > 0) {
      esperando.shift()?.(undefined);
    }
  });

  return {
    close() {
      rl.close();
    },
    next(prompt) {
      const bufferada = fila.shift();
      if (bufferada !== undefined) {
        return Promise.resolve(bufferada);
      }
      if (fechado) {
        return Promise.resolve(undefined);
      }
      output.write(prompt);
      return new Promise((resolve) => {
        esperando.push(resolve);
      });
    },
  };
}
