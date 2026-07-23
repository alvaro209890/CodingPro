/**
 * Runtime da TUI Aurora — ponte entre o loop agêntico e a interface Ink/React.
 * Gerencia estado via closures e força re-renders do Ink.
 */
import { render } from "ink";
import React from "react";
import type { CostBreakdown } from "@codingpro/llm";
import type { PermissionRequest } from "@codingpro/core";

// Import dinâmico — o Ink é opcional (só carregado com --tui)
let App: typeof import("@codingpro/tui").App;
let BlocoMensagem: typeof import("@codingpro/tui").BlocoMensagem;

interface TuiRuntime {
  adicionarMensagem(bloco: unknown): void;
  atualizarStreaming(texto: string): void;
  atualizarEvento(evento: string): void;
  atualizarCusto(custo: CostBreakdown): void;
  pedirAprovacao(request: PermissionRequest): Promise<"approve-always" | "approve-once" | "deny">;
  fechar(): void;
  perguntar(mensagem: string): Promise<string>;
}

export async function criarTuiRuntime(options: {
  providerModel: string;
}): Promise<TuiRuntime> {
  // Carrega módulos Ink dinamicamente
  const tui = await import("@codingpro/tui");
  App = tui.App;
  const { default: inkRender } = await import("ink");
  const React = await import("react");

  let resolverInput: ((texto: string) => void) | undefined;
  let resolverAprovacao:
    | ((resultado: "approve-always" | "approve-once" | "deny") => void)
    | undefined;
  let inputAtual = "";

  // Estado mutável — o componente lê via closures
  const state = {
    mensagens: [] as unknown[],
    streaming: "",
    eventoAtual: "",
    modelo: options.providerModel ?? "Pro",
    cache: 0,
    custo: "",
    passos: 0,
    aprovacaoPendente: undefined as PermissionRequest | undefined,
    prompt: "› ",
  };

  function TuiApp() {
    const [, forceUpdate] = React.useState(0);
    const rerender = () => forceUpdate((n) => n + 1);

    // Expõe rerender para o runtime
    (TuiApp as { rerender?: () => void }).rerender = rerender;

    return React.createElement(App, {
      cache: state.cache || undefined,
      custo: state.custo || undefined,
      eventoAtual: state.eventoAtual || undefined,
      mensagens: state.mensagens as readonly { tipo: string; texto: string; detalhes?: string }[],
      modelo: state.modelo,
      passos: state.passos,
      streaming: state.streaming || undefined,
      aprovacaoPendente: state.aprovacaoPendente
        ? { request: state.aprovacaoPendente }
        : undefined,
      onAprovacao: (resultado) => {
        state.aprovacaoPendente = undefined;
        resolverAprovacao?.(resultado);
        resolverAprovacao = undefined;
        rerender();
      },
    });
  }

  const { unmount } = inkRender(React.createElement(TuiApp));

  return {
    adicionarMensagem(bloco: unknown) {
      state.mensagens = [...state.mensagens, bloco];
      (TuiApp as { rerender?: () => void }).rerender?.();
    },
    atualizarStreaming(texto: string) {
      state.streaming = texto;
      (TuiApp as { rerender?: () => void }).rerender?.();
    },
    atualizarEvento(evento: string) {
      state.eventoAtual = evento;
      (TuiApp as { rerender?: () => void }).rerender?.();
    },
    atualizarCusto(custo: CostBreakdown) {
      state.custo = `US$ ${custo.totalCostUsd.toFixed(4)}`;
      state.cache = Math.round(custo.cacheHitRate * 100);
      (TuiApp as { rerender?: () => void }).rerender?.();
    },
    pedirAprovacao(
      request: PermissionRequest,
    ): Promise<"approve-always" | "approve-once" | "deny"> {
      return new Promise((resolve) => {
        state.aprovacaoPendente = request;
        resolverAprovacao = resolve;
        (TuiApp as { rerender?: () => void }).rerender?.();
      });
    },
    perguntar(_mensagem: string): Promise<string> {
      return new Promise((resolve) => {
        resolverInput = resolve;
      });
    },
    fechar() {
      unmount();
    },
  };
}
