import { exerciseById } from "@/features/treino/catalog/catalog";

export const METRICAS = ["repeticoes", "minutos", "treinos", "exercicio"] as const;
export type Metrica = (typeof METRICAS)[number];

export interface Desafio {
  metric: Metrica;
  exerciseId: string | null;
  target: number;
}

export interface SessaoDaSemana {
  profileId: string;
  durationSeconds: number;
  /** `holdSeconds` só entra na regra do que conta como treino (`contaComoTreino`). */
  logs: { exerciseId: string; reps: number; holdSeconds?: number }[];
}

/** Quanto uma sessão soma para a meta do desafio. */
export function contribuicao(desafio: Desafio, sessao: SessaoDaSemana) {
  switch (desafio.metric) {
    case "repeticoes":
      return sessao.logs.reduce((t, l) => t + l.reps, 0);
    case "minutos":
      return sessao.durationSeconds / 60;
    case "treinos":
      return 1;
    case "exercicio":
      return sessao.logs
        .filter((l) => l.exerciseId === desafio.exerciseId)
        .reduce((t, l) => t + l.reps, 0);
  }
}

/**
 * Soma da família e quanto cada perfil somou, na ordem da família: o desafio é cooperativo,
 * então ninguém é ordenado do maior para o menor (a parte de cada um mora em `regras.ts`).
 */
export function placar(
  desafio: Desafio,
  sessoes: SessaoDaSemana[],
  perfis: { id: string; name: string; color: string }[],
) {
  const porPerfil = new Map(perfis.map((p) => [p.id, 0]));
  for (const s of sessoes)
    if (porPerfil.has(s.profileId))
      porPerfil.set(s.profileId, (porPerfil.get(s.profileId) ?? 0) + contribuicao(desafio, s));
  const linhas = perfis.map((p) => ({ ...p, valor: Math.floor(porPerfil.get(p.id) ?? 0) }));
  const total = linhas.reduce((t, l) => t + l.valor, 0);
  return {
    total,
    concluido: total >= desafio.target,
    progresso: Math.min(1, total / desafio.target),
    linhas,
  };
}

/** A meta em português; `pessoal` tira o "juntos" do desafio da família. */
export function descreverDesafio(desafio: Desafio, { pessoal = false } = {}) {
  const juntos = pessoal ? " na semana" : " juntos";
  switch (desafio.metric) {
    case "repeticoes":
      return `${desafio.target} repetições${juntos}`;
    case "minutos":
      return `${desafio.target} minutos de treino${juntos}`;
    case "treinos":
      return `${desafio.target} treinos na semana`;
    case "exercicio":
      return `${desafio.target} repetições de ${
        desafio.exerciseId ? exerciseById(desafio.exerciseId).name.toLowerCase() : "um exercício"
      }`;
  }
}

/** Sugestões prontas para a família escolher. */
export const SUGESTOES: Desafio[] = [
  { metric: "treinos", exerciseId: null, target: 6 },
  { metric: "repeticoes", exerciseId: null, target: 500 },
  { metric: "minutos", exerciseId: null, target: 90 },
  { metric: "exercicio", exerciseId: "agachamento", target: 200 },
  { metric: "exercicio", exerciseId: "polichinelo", target: 300 },
];
