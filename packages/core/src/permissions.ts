import type { JsonObject, ToolResult } from "@codingpro/llm";
import type { ToolContext, ToolSideEffect } from "./tool.js";

/** Modos de permissão do produto. Padrão após checkpoint = `allowlist`. */
export type PermissionMode = "allowlist" | "ask" | "auto";

/** Decisão pura, antes de qualquer interação. */
export type PermissionDecision = "allow" | "ask" | "deny";

/** Resposta do aprovador humano quando a decisão é `ask`. */
export type Approval = "approve-always" | "approve-once" | "deny";

export interface PermissionRequest {
  /** Argumentos da chamada (não validados) — só para exibir o que será aprovado. */
  readonly input?: JsonObject;
  readonly sideEffect: ToolSideEffect;
  readonly toolName: string;
}

export interface PermissionPolicy {
  readonly allowlist?: readonly string[];
  /**
   * Tools sempre liberadas, independentemente de modo/checkpoint, por não terem efeito no projeto
   * do usuário (ex.: `remember`, que só escreve na loja de memória da própria CLI).
   */
  readonly alwaysAllow?: readonly string[];
  /** Enquanto não houver checkpoint (git só na F2), efeitos nunca são automáticos. */
  readonly checkpointAvailable?: boolean;
  readonly denylist?: readonly string[];
  readonly mode: PermissionMode;
}

/** Aprovador interativo — a TUI o implementa; nos testes é um duplo. */
export interface Approver {
  request(request: PermissionRequest, context: ToolContext): Promise<Approval>;
}

/**
 * Decisão pura e fail-closed. Ordem: denylist → leitura sempre liberada → efeito exige
 * checkpoint para poder ser automático; sem checkpoint, todo efeito cai em `ask`.
 */
export function decidePermission(
  policy: PermissionPolicy,
  request: PermissionRequest,
): PermissionDecision {
  if (policy.denylist?.includes(request.toolName) === true) {
    return "deny";
  }
  if (policy.alwaysAllow?.includes(request.toolName) === true) {
    return "allow";
  }
  if (request.sideEffect === "read") {
    return "allow";
  }
  if (policy.checkpointAvailable !== true) {
    return "ask";
  }
  switch (policy.mode) {
    case "auto":
      return "allow";
    case "allowlist":
      return policy.allowlist?.includes(request.toolName) === true ? "allow" : "ask";
    default:
      return "ask";
  }
}

/**
 * Controlador com estado de sessão: aplica a decisão pura e, quando é `ask`, consulta o
 * aprovador. `approve-always` memoriza o nome da tool para o resto da sessão. Fail-closed:
 * sem aprovador, qualquer `ask` vira negação.
 */
export class PermissionController {
  private readonly sessionAllow = new Set<string>();

  constructor(
    private readonly policy: PermissionPolicy,
    private readonly approver?: Approver,
  ) {}

  async authorize(request: PermissionRequest, context: ToolContext): Promise<boolean> {
    if (this.sessionAllow.has(request.toolName)) {
      return true;
    }
    const decision = decidePermission(this.policy, request);
    if (decision === "allow") {
      return true;
    }
    if (decision === "deny" || this.approver === undefined) {
      return false;
    }
    const approval = await this.approver.request(request, context);
    if (approval === "approve-always") {
      this.sessionAllow.add(request.toolName);
      return true;
    }
    return approval === "approve-once";
  }
}

export function deniedResult(toolName: string): ToolResult {
  return {
    reason: `A execução de "${toolName}" não foi autorizada.`,
    type: "execution-denied",
  };
}
