import { useCallback, useEffect, useState } from "react";
import { type TemaNome, TEMAS, nomeTemaValido } from "../shared/temas-paleta.js";

const STORAGE_KEY = "codingpro-theme";

function carregarTemaSalvo(): TemaNome {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return nomeTemaValido(raw);
  } catch {
    return "aurora";
  }
}

function aplicarTemaHtml(nome: TemaNome): void {
  document.documentElement.setAttribute("data-theme", nome);
}

function detectarTemaWindows(): TemaNome | null {
  try {
    if (typeof window === "undefined") return null;
    // matchMedia('(prefers-color-scheme: dark)') → se for claro, sugerimos solar
    const prefereClaro = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    return prefereClaro ? "solar" : null; // null = mantém aurora como padrão
  } catch {
    return null;
  }
}

export function useTheme() {
  const [tema, setTemaState] = useState<TemaNome>(carregarTemaSalvo);

  // Aplica data-theme no <html> sempre que mudar
  useEffect(() => {
    aplicarTemaHtml(tema);
  }, [tema]);

  // Detecta mudanças no tema do Windows em tempo real
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      // Só auto-alterna se o usuário nunca escolheu manualmente
      const manual = localStorage.getItem(STORAGE_KEY);
      if (!manual) {
        const novoTema = e.matches ? "solar" : "aurora";
        setTemaState(novoTema);
        aplicarTemaHtml(novoTema);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTema = useCallback((novo: TemaNome) => {
    setTemaState(novo);
    try {
      localStorage.setItem(STORAGE_KEY, novo);
    } catch {
      // ignore
    }
  }, []);

  return { tema, setTema, temas: TEMAS } as const;
}
