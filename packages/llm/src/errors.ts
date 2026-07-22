export type ProviderErrorCode =
  | "invalid-fixture"
  | "invalid-response"
  | "not-configured"
  | "replay-exhausted"
  | "replay-mismatch";

export class ProviderError extends Error {
  override readonly name = "ProviderError";

  constructor(
    readonly code: ProviderErrorCode,
    readonly safeMessage: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(safeMessage, options);
  }
}
