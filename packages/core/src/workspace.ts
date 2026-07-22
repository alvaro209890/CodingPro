import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { CoreError } from "./errors.js";

const MAX_PATH_BYTES = 4_096;

/** Rejeita caracteres de controle que quebram terminais ou escondem o alvo real do caminho. */
function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      code <= 31 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    );
  });
}

function assertSafeInput(input: unknown): asserts input is string {
  if (typeof input !== "string" || input.length === 0) {
    throw new CoreError("invalid-input", "O caminho precisa ser um texto não vazio.");
  }
  if (Buffer.byteLength(input, "utf8") > MAX_PATH_BYTES) {
    throw new CoreError("invalid-input", "O caminho é longo demais.");
  }
  if (input.includes("\0") || hasControlCharacter(input)) {
    throw new CoreError("invalid-input", "O caminho contém caracteres inválidos.");
  }
  if (isAbsolute(input) || input.startsWith("~")) {
    throw new CoreError(
      "path-escape",
      "Use caminhos relativos ao projeto; caminhos absolutos não são permitidos.",
    );
  }
}

/**
 * Raiz de trabalho canonicalizada. Toda tool de arquivo passa por aqui: nenhum caminho
 * resolvido ou realpath pode escapar da raiz. Falha fechada e nunca expõe caminho absoluto.
 */
export class Workspace {
  private constructor(readonly root: string) {}

  /** A raiz precisa existir; é canonicalizada com realpath para ancorar as checagens. */
  static async create(root: string): Promise<Workspace> {
    if (typeof root !== "string" || root.length === 0) {
      throw new CoreError("invalid-input", "A raiz do projeto é inválida.");
    }
    let canonical: string;
    try {
      canonical = await realpath(resolve(root));
    } catch {
      throw new CoreError("not-found", "A raiz do projeto não existe.");
    }
    return new Workspace(canonical);
  }

  private assertInside(absolute: string): void {
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new CoreError("path-escape", "O caminho aponta para fora do projeto.");
    }
  }

  /** Resolução léxica com contenção. Não toca no disco. */
  resolve(input: unknown): string {
    assertSafeInput(input);
    const resolved = resolve(this.root, input);
    this.assertInside(resolved);
    return resolved;
  }

  /**
   * Canonicaliza um caminho existente e reconfirma a contenção — defesa contra symlink
   * que aponte para fora da raiz. Falha fechada se o alvo não existir ou escapar.
   */
  async realpathInside(absolute: string): Promise<string> {
    let canonical: string;
    try {
      canonical = await realpath(absolute);
    } catch {
      throw new CoreError("not-found", "O caminho não existe.");
    }
    this.assertInside(canonical);
    return canonical;
  }

  /** Caminho relativo à raiz, seguro para exibir. A própria raiz vira ".". */
  toRelative(absolute: string): string {
    const rel = relative(this.root, absolute);
    return rel === "" ? "." : rel;
  }
}
