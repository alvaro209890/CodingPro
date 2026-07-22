import { ProviderError } from "./errors.js";

/** Papéis de produto. O usuário e a config nunca escolhem ID de modelo arbitrário. */
export const MODEL_ROLES = Object.freeze(["auto", "main", "fast"] as const);
export type ModelRole = (typeof MODEL_ROLES)[number];

/** Padrão de produto: codificação/arquitetura/revisão usam Pro via `auto` → `main`. */
export const DEFAULT_MODEL_ROLE: ModelRole = "auto";

/** Papel fixo de codificação/arquitetura/revisão. */
export const MODEL_ROLE_MAIN: ModelRole = "main";

/** Papel fixo de trabalho mecânico (roteador, explorer, resumo, commit, compactação). */
export const MODEL_ROLE_FAST: ModelRole = "fast";

/** IDs allowlisted — espelham as constantes do provider sem import circular. */
export const ROLE_MODEL_PRO = "deepseek-v4-pro" as const;
export const ROLE_MODEL_FLASH = "deepseek-v4-flash" as const;

export type ResolvedDeepSeekModel = typeof ROLE_MODEL_PRO | typeof ROLE_MODEL_FLASH;

export function isModelRole(value: unknown): value is ModelRole {
  return value === "auto" || value === "main" || value === "fast";
}

/**
 * Resolve um papel de produto para o ID allowlisted do DeepSeek.
 * `auto` e `main` → Pro; `fast` → Flash. Qualquer outro valor falha fechado.
 */
export function resolveDeepSeekModelForRole(
  role: ModelRole = DEFAULT_MODEL_ROLE,
): ResolvedDeepSeekModel {
  switch (role) {
    case "auto":
    case "main":
      return ROLE_MODEL_PRO;
    case "fast":
      return ROLE_MODEL_FLASH;
    default: {
      const exhaustive: never = role;
      throw new ProviderError(
        "not-configured",
        `O papel de modelo é inválido: ${String(exhaustive)}.`,
      );
    }
  }
}

/**
 * Aceita desconhecido e falha fechado se não for um papel de produto.
 * Não aceita IDs de modelo, providers nem endpoints.
 */
export function parseModelRole(value: unknown): ModelRole {
  if (isModelRole(value)) {
    return value;
  }
  throw new ProviderError("not-configured", "O papel de modelo é inválido.");
}
