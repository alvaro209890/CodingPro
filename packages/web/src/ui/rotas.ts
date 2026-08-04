import { useEffect, useState } from "react";

/**
 * Roteador mínimo por `history.pushState`. São seis telas — trazer o React Router
 * para isso custaria mais em bundle do que estas 30 linhas.
 */
export function navegar(caminho: string): void {
  const atual = `${window.location.pathname}${window.location.search}`;
  if (atual === caminho) return;
  window.history.pushState({}, "", caminho);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Só aceita caminhos internos relativos — evita open redirect. */
export function destinoSeguro(bruto: string | null | undefined, padrao = "/painel"): string {
  if (!bruto) return padrao;
  if (!bruto.startsWith("/") || bruto.startsWith("//") || bruto.includes("://")) return padrao;
  return bruto;
}

export function useCaminho(): string {
  const [caminho, setCaminho] = useState(() => window.location.pathname);

  useEffect(() => {
    const aoMudar = () => setCaminho(window.location.pathname);
    window.addEventListener("popstate", aoMudar);
    return () => window.removeEventListener("popstate", aoMudar);
  }, []);

  return caminho;
}

/** `<a href>` que navega sem recarregar a página, mas continua sendo um link de verdade. */
export function propsLink(caminho: string) {
  return {
    href: caminho,
    onClick: (evento: React.MouseEvent<HTMLAnchorElement>) => {
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
      evento.preventDefault();
      navegar(caminho);
    },
  };
}
