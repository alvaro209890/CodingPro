export type CoreErrorCode =
  | "denied"
  | "duplicate-tool"
  | "execution-failed"
  | "invalid-input"
  | "not-a-directory"
  | "not-a-file"
  | "not-found"
  | "path-escape"
  | "timeout"
  | "too-large"
  | "unknown-tool";

/**
 * Erro do núcleo com mensagem sempre segura para exibição.
 * `safeMessage` nunca deve conter caminho absoluto do sistema nem detalhe sensível:
 * a fronteira de tools só reporta caminhos relativos ao workspace.
 */
export class CoreError extends Error {
  override readonly name = "CoreError";

  constructor(
    readonly code: CoreErrorCode,
    readonly safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
  }
}
