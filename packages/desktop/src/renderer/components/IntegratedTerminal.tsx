import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface IntegratedTerminalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
}

type Linha = {
  /** Id próprio: usar o texto como chave duplicava a chave ao repetir um comando. */
  id: number;
  tipo: "cmd" | "saida" | "erro" | "meta";
  texto: string;
};

let contadorLinha = 0;
function linha(tipo: Linha["tipo"], texto: string): Linha {
  contadorLinha += 1;
  return { id: contadorLinha, texto, tipo };
}

export const IntegratedTerminal: React.FC<IntegratedTerminalProps> = ({ isOpen, onClose, cwd }) => {
  const [entrada, setEntrada] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [executando, setExecutando] = useState(false);
  const [historico, setHistorico] = useState<string[]>([]);
  const [posHistorico, setPosHistorico] = useState<number | null>(null);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rolar ao mudar as linhas
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "nearest" });
  }, [linhas]);

  // Foco no campo ao abrir: abrir o terminal e ter que clicar nele é atrito puro.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const executar = useCallback(async () => {
    const cmd = entrada.trim();
    if (!cmd || executando) return;
    setEntrada("");
    setPosHistorico(null);
    setHistorico((h) => (h[h.length - 1] === cmd ? h : [...h, cmd]));
    setExecutando(true);
    setLinhas((prev) => [...prev, linha("cmd", `$ ${cmd}`)]);

    try {
      if (!window.codingproAPI) {
        setLinhas((prev) => [...prev, linha("erro", "API desktop não conectada.")]);
        return;
      }
      const res = await window.codingproAPI.runTerminalCommand(cmd);
      const novas: Linha[] = [];
      if (res.stdout.trim()) novas.push(linha("saida", res.stdout.trimEnd()));
      if (res.stderr.trim()) novas.push(linha("erro", res.stderr.trimEnd()));
      novas.push(
        linha("meta", res.exitCode === 0 ? "concluído" : `saiu com código ${res.exitCode}`),
      );
      setLinhas((prev) => [...prev, ...novas]);
    } catch (err: unknown) {
      setLinhas((prev) => [
        ...prev,
        linha("erro", err instanceof Error ? err.message : String(err)),
      ]);
    } finally {
      setExecutando(false);
      inputRef.current?.focus();
    }
  }, [entrada, executando]);

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void executar();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    // Histórico de comandos, como em qualquer terminal.
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historico.length === 0) return;
      const prox = posHistorico === null ? historico.length - 1 : Math.max(0, posHistorico - 1);
      setPosHistorico(prox);
      setEntrada(historico[prox] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (posHistorico === null) return;
      const prox = posHistorico + 1;
      if (prox >= historico.length) {
        setPosHistorico(null);
        setEntrada("");
        return;
      }
      setPosHistorico(prox);
      setEntrada(historico[prox] ?? "");
    }
  };

  if (!isOpen) return null;

  return (
    <section className="terminal-painel" aria-label="Terminal integrado">
      <header className="terminal-barra">
        <span className="terminal-titulo">
          <svg
            aria-hidden="true"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Terminal
        </span>
        {cwd && (
          <span className="terminal-cwd" title={cwd}>
            {cwd}
          </span>
        )}
        <span className="terminal-barra-acoes">
          <button
            type="button"
            className="terminal-btn"
            onClick={() => setLinhas([])}
            disabled={linhas.length === 0}
            title="Limpar a saída"
          >
            Limpar
          </button>
          <button
            type="button"
            className="terminal-btn"
            onClick={onClose}
            aria-label="Fechar terminal"
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </span>
      </header>

      <div className="terminal-saida" aria-live="polite">
        {linhas.length === 0 && (
          <p className="terminal-vazio">
            Comandos rodam na pasta aberta, com limite de 60 segundos. Use ↑ para repetir o último.
          </p>
        )}
        {linhas.map((l) => (
          <pre key={l.id} className={`terminal-linha terminal-linha--${l.tipo}`}>
            {l.texto}
          </pre>
        ))}
        {executando && <p className="terminal-linha terminal-linha--meta">executando…</p>}
        <div ref={fimRef} />
      </div>

      <div className="terminal-entrada">
        <span className="terminal-prompt" aria-hidden="true">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="git status, pnpm test, dir…"
          aria-label="Comando do terminal"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={aoTeclar}
          disabled={executando}
          spellCheck={false}
        />
      </div>
    </section>
  );
};
