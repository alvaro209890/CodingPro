import type { CSSProperties, ReactNode } from "react";

export function Aviso({
  tipo = "info",
  children,
}: {
  tipo?: "info" | "erro" | "sucesso" | "atencao";
  children: ReactNode;
}) {
  return <div className={`aviso ${tipo === "info" ? "" : tipo}`}>{children}</div>;
}

export function Cartao({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`cartao ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Metrica({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="metrica">
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor}</span>
    </div>
  );
}

/** Barra de progresso do limite; vira alerta a partir de 80%. */
export function Barra({ percentual }: { percentual: number }) {
  const limitado = Math.max(0, Math.min(100, percentual));
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(limitado)}
      className={`barra ${limitado >= 80 ? "alerta" : ""}`}
      role="progressbar"
    >
      <i style={{ width: `${limitado}%` }} />
    </div>
  );
}

export function SeloStatus({ status }: { status: string }) {
  const classe =
    status === "ativo"
      ? "ok"
      : status === "pendente"
        ? "espera"
        : status === "bloqueado"
          ? "ruim"
          : "";
  const rotulo =
    status === "ativo"
      ? "Ativa"
      : status === "pendente"
        ? "Pendente"
        : status === "bloqueado"
          ? "Bloqueada"
          : status;
  return <span className={`selo ${classe}`}>{rotulo}</span>;
}

/** Gráfico de barras diário. 30 pontos não justificam uma biblioteca de charts. */
export function GraficoDiario({
  dados,
}: {
  dados: readonly { dia: string; custoMicro: number }[];
}) {
  if (dados.length === 0) {
    return <p className="fraco">Nenhum consumo registrado ainda.</p>;
  }
  const maximo = Math.max(...dados.map((d) => d.custoMicro), 1);
  return (
    <div className="grafico">
      {dados.map((ponto) => (
        <div
          key={ponto.dia}
          style={{ height: `${Math.max(2, (ponto.custoMicro / maximo) * 100)}%` }}
          title={`${ponto.dia}: US$ ${(ponto.custoMicro / 1e6).toFixed(4)}`}
        />
      ))}
    </div>
  );
}

export function Modal({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay de modal, o conteúdo tem foco próprio
    // biome-ignore lint/a11y/useKeyWithClickEvents: fechar pelo overlay é atalho; o botão Cancelar é o caminho acessível
    <div className="modal-fundo" onClick={onFechar}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: impede que o clique dentro feche o modal */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: só barra a propagação, não é um controle */}
      <div
        aria-modal="true"
        className="cartao modal"
        onClick={(evento) => evento.stopPropagation()}
        role="dialog"
      >
        <div className="linha" style={{ marginBottom: "1rem" }}>
          <h3 style={{ margin: 0 }}>{titulo}</h3>
          <span className="espacador" />
          <button className="pequeno" onClick={onFechar} type="button">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <p className="fraco centro">{texto}</p>;
}
