/**
 * Companheiro/XP da CLI (100% cosmético e desligável). O "pet" ganha XP a cada turno concluído,
 * um pouco mais quando o turno editou arquivos, e sobe de nível numa curva suave. Módulo puro:
 * a persistência e o flag de habilitação ficam em `pet-runtime.ts`.
 */

export interface EstadoPet {
  /** XP total acumulado (monotônico). */
  readonly xp: number;
  /** Nível derivado do XP (cache; sempre reconciliado por `nivelDeXp`). */
  readonly nivel: number;
  /** Turnos concluídos que editaram algo, em sequência (quebra em turno sem edição). */
  readonly sequencia: number;
  /** ISO-8601 da última atualização. */
  readonly atualizadoEm: string;
}

/** XP base por turno concluído. */
export const XP_POR_TURNO = 10;
/** XP extra quando o turno produziu ao menos uma edição de arquivo. */
export const XP_POR_EDICAO = 8;

/** XP total necessário para *entrar* em `nivel` (curva quadrática leve). */
export function limiarNivel(nivel: number): number {
  const n = Math.max(1, Math.floor(nivel));
  return 25 * n * (n - 1);
}

/** Maior nível cujo limiar já foi alcançado por `xp`. */
export function nivelDeXp(xp: number): number {
  const x = Math.max(0, Math.floor(xp));
  let n = 1;
  while (limiarNivel(n + 1) <= x) {
    n += 1;
  }
  return n;
}

export interface EstagioPet {
  /** Nível mínimo para exibir este estágio. */
  readonly nivel: number;
  readonly glifo: string;
  readonly ascii: string;
  readonly nome: string;
}

/** Estágios de evolução (mais alto que couber no nível atual vence). */
const ESTAGIOS: readonly EstagioPet[] = Object.freeze([
  { ascii: "(o)", glifo: "🥚", nivel: 1, nome: "ovo" },
  { ascii: "(v)", glifo: "🐣", nivel: 2, nome: "filhote" },
  { ascii: "(^)", glifo: "🐤", nivel: 4, nome: "aprendiz" },
  { ascii: "<o>", glifo: "🦉", nivel: 6, nome: "coruja" },
  { ascii: "/>", glifo: "🐉", nivel: 9, nome: "dragão" },
]);

/** Estágio correspondente a um nível. */
export function estagioPara(nivel: number): EstagioPet {
  let atual = ESTAGIOS[0] as EstagioPet;
  for (const e of ESTAGIOS) {
    if (nivel >= e.nivel) {
      atual = e;
    }
  }
  return atual;
}

export function estadoInicialPet(): EstadoPet {
  return { atualizadoEm: new Date(0).toISOString(), nivel: 1, sequencia: 0, xp: 0 };
}

/** Normaliza um estado possivelmente corrompido (vindo de JSON externo). */
export function sanitizarPet(bruto: unknown): EstadoPet {
  const base = estadoInicialPet();
  if (typeof bruto !== "object" || bruto === null) {
    return base;
  }
  const o = bruto as Record<string, unknown>;
  const xp = typeof o.xp === "number" && Number.isFinite(o.xp) && o.xp >= 0 ? Math.floor(o.xp) : 0;
  const sequencia =
    typeof o.sequencia === "number" && Number.isFinite(o.sequencia) && o.sequencia >= 0
      ? Math.floor(o.sequencia)
      : 0;
  const atualizadoEm =
    typeof o.atualizadoEm === "string" && o.atualizadoEm.length > 0
      ? o.atualizadoEm
      : base.atualizadoEm;
  return { atualizadoEm, nivel: nivelDeXp(xp), sequencia, xp };
}

export interface ResultadoXp {
  readonly estado: EstadoPet;
  /** Quantos níveis subiu neste ganho (0 = nenhum). */
  readonly subiuNiveis: number;
}

/**
 * Aplica o XP de um turno. `houveEdicao` soma o bônus e mantém a sequência viva;
 * um turno sem edição zera a sequência.
 */
export function ganharXp(
  estado: EstadoPet,
  houveEdicao: boolean,
  agora: Date = new Date(),
): ResultadoXp {
  const nivelAntes = nivelDeXp(estado.xp);
  const ganho = XP_POR_TURNO + (houveEdicao ? XP_POR_EDICAO : 0);
  const xp = estado.xp + ganho;
  const nivel = nivelDeXp(xp);
  return {
    estado: {
      atualizadoEm: agora.toISOString(),
      nivel,
      sequencia: houveEdicao ? estado.sequencia + 1 : 0,
      xp,
    },
    subiuNiveis: Math.max(0, nivel - nivelAntes),
  };
}

/** Barra de progresso até o próximo nível (ASCII-safe). */
export function barraXp(estado: EstadoPet, largura = 8, ascii = false): string {
  const nivel = nivelDeXp(estado.xp);
  const base = limiarNivel(nivel);
  const proximo = limiarNivel(nivel + 1);
  const faixa = Math.max(1, proximo - base);
  const frac = Math.max(0, Math.min(1, (estado.xp - base) / faixa));
  const cheios = Math.round(frac * largura);
  const fill = ascii ? "#" : "▓";
  const empty = ascii ? "-" : "░";
  return fill.repeat(cheios) + empty.repeat(Math.max(0, largura - cheios));
}

/**
 * Linha pura (sem ANSI) descrevendo o pet — o tema aplica cor no chamador.
 * Ex.: `🐣 filhote · nível 2 · 60/150 XP ▓▓▓░░░░░ · seq 3`
 */
export function formatarPet(estado: EstadoPet, ascii = false): string {
  const nivel = nivelDeXp(estado.xp);
  const est = estagioPara(nivel);
  const proximo = limiarNivel(nivel + 1);
  const icone = ascii ? est.ascii : est.glifo;
  const barra = barraXp(estado, 8, ascii);
  const seq = estado.sequencia > 1 ? ` · seq ${estado.sequencia}` : "";
  return `${icone} ${est.nome} · nível ${nivel} · ${estado.xp}/${proximo} XP ${barra}${seq}`;
}
