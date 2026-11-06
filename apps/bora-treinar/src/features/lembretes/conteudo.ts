import { type Desafio, descreverDesafio, placar } from "@/features/desafios/placar";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { FREE_WORKOUT_IDS, workoutById } from "@/features/treino/catalog/workouts";
import {
  contaComoTreino,
  contaPeloVolume,
  historicoDosInstantes,
  type MelhorMarca,
  metaValida,
  type RecordeBatido,
  recordesBatidos,
  type SemanaAtual,
  semanaDosInstantes,
} from "@/features/treino/engine/habito";
import { type ProgressMap, pendingSuggestions } from "@/features/treino/engine/progression";
import { numeroDoDia } from "@/lib/datas";

/** Uma sessão da semana do resumo, com as séries. */
export interface SessaoResumo {
  profileId: string;
  durationSeconds: number;
  logs: { exerciseId: string; kind: "reps" | "hold"; reps: number; holdSeconds: number }[];
}

/** Uma sessão já somada no banco (`sessoesSomadasDesde`): volume = repetições + isometria. */
export interface SessaoSomada {
  profileId: string;
  startedAt: number;
  duration: number;
  volume: number;
}

export interface BlocoPerfil {
  id: string;
  nome: string;
  linhas: string[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const nomeDoExercicio = (id: string) => EXERCISES.find((e) => e.id === id)?.name ?? id;
const contam = (sessoes: readonly SessaoSomada[]) =>
  sessoes.filter((s) => contaPeloVolume(s.volume, s.duration));

/** Treinos que o lembrete sugere quando a assinatura (ou o teste) libera todos. */
export const SUGESTOES_LIBERADAS: readonly string[] = ["core-rapido", "emom-6"];

/** O plano gratuito só ouve falar dos treinos gratuitos. */
export function sugestaoDeTreino(liberado: boolean) {
  const [a, b] = (liberado ? SUGESTOES_LIBERADAS : FREE_WORKOUT_IDS).map(
    (id) => workoutById(id).name,
  );
  return `Dez minutinhos já contam: o ${a} ou o ${b} são um bom começo.`;
}

/** "Helena: 1 de 3 dias nesta semana." */
export function linhaDaMeta(nome: string, semana: Pick<SemanaAtual, "dias" | "meta" | "cumprida">) {
  return semana.cumprida
    ? `${nome}: meta da semana cumprida (${plural(semana.dias, "dia", "dias")} de treino).`
    : `${nome}: ${semana.dias} de ${plural(semana.meta, "dia", "dias")} nesta semana.`;
}

/**
 * O lembrete do dia: cada perfil que ainda não treinou hoje (só vale sessão que conta como
 * treino), com o quanto falta para a meta da semana. `null` quando todos já treinaram.
 */
export function montarLembrete(
  perfis: { id: string; name: string; weeklyGoal: number }[],
  sessoes: readonly SessaoSomada[],
  agora: number,
  fuso: string,
  liberado: boolean,
) {
  const hoje = numeroDoDia(agora, fuso);
  const validas = contam(sessoes);
  const linhas = perfis.flatMap((p) => {
    const instantes = validas.filter((s) => s.profileId === p.id).map((s) => s.startedAt);
    if (instantes.some((t) => numeroDoDia(t, fuso) === hoje)) return [];
    return [linhaDaMeta(p.name, semanaDosInstantes(instantes, agora, fuso, p.weeklyGoal))];
  });
  return linhas.length ? { linhas, sugestao: sugestaoDeTreino(liberado) } : null;
}

export function textoLembrete(
  lembrete: NonNullable<ReturnType<typeof montarLembrete>>,
  appUrl: string,
  unsubscribeUrl?: string,
) {
  return [
    "Hora de treinar!",
    "",
    "Ainda falta o treino de hoje:",
    ...lembrete.linhas,
    "",
    lembrete.sugestao,
    "",
    `Abrir o app: ${appUrl}/perfis`,
    ...(unsubscribeUrl ? [`Para não receber mais lembretes: ${unsubscribeUrl}`] : []),
  ].join("\n");
}

/** O hábito de um perfil no resumo da semana que terminou. */
export interface HabitoDoPerfil {
  dias: number;
  meta: number;
  cumprida: boolean;
  /** semanas seguidas com a meta cumprida (`historicoDeSemanas`) */
  seguidas: number;
  recordes: RecordeBatido[];
  /** níveis novos esperando a pessoa aceitar, pelo nome dos exercícios */
  proximosNiveis: { de: string; para: string }[];
}

/**
 * Junta o que o resumo diz de um perfil. `agora` é durante a semana nova (segunda de manhã): a
 * semana do resumo é a anterior. `progresso` é `null` quando o plano não tem os níveis.
 */
export function habitoDoPerfil(entrada: {
  meta: number;
  /** sessões somadas do perfil, de bem antes (as semanas seguidas) até agora */
  historico: readonly SessaoSomada[];
  /** sessões do perfil na semana do resumo, com as séries */
  daSemana: readonly SessaoResumo[];
  melhoresAntes: ReadonlyMap<string, MelhorMarca>;
  progresso: ProgressMap | null;
  agora: number;
  fuso: string;
}): HabitoDoPerfil {
  const historico = historicoDosInstantes(
    contam(entrada.historico).map((s) => s.startedAt),
    entrada.agora,
    entrada.fuso,
    entrada.meta,
    2,
  );
  const semana = historico.semanas[0] ?? { dias: 0, cumprida: false };
  const logs = entrada.daSemana
    .filter((s) => contaComoTreino({ duration: s.durationSeconds, logs: s.logs }))
    .flatMap((s) => s.logs);
  return {
    dias: semana.dias,
    meta: metaValida(entrada.meta),
    cumprida: semana.cumprida,
    seguidas: historico.seguidas,
    recordes: recordesBatidos(logs, entrada.melhoresAntes),
    proximosNiveis: pendingSuggestions(entrada.progresso ?? {}).flatMap((s) =>
      s.type === "level" ? [{ de: nomeDoExercicio(s.from), para: nomeDoExercicio(s.to) }] : [],
    ),
  };
}

function linhasDoHabito(h: HabitoDoPerfil, treinou: boolean) {
  const linhas: string[] = [];
  if (treinou)
    linhas.push(
      h.cumprida
        ? `Meta da semana cumprida: ${plural(h.dias, "dia", "dias")} de treino.${h.seguidas >= 2 ? ` São ${h.seguidas} semanas seguidas.` : ""}`
        : `Meta da semana: ${h.dias} de ${plural(h.meta, "dia", "dias")}.`,
    );
  if (h.recordes.length)
    linhas.push(
      `${h.recordes.length === 1 ? "Recorde" : "Recordes"} da semana: ${h.recordes
        .map(
          (r) =>
            `${nomeDoExercicio(r.exerciseId)} (${r.kind === "hold" ? `${r.value} s` : r.value})`,
        )
        .join(", ")}.`,
    );
  for (const n of h.proximosNiveis)
    linhas.push(`Próximo nível liberado: de ${n.de} para ${n.para}. É só aceitar no app.`);
  return linhas;
}

/**
 * Texto do resumo da semana, perfil por perfil. Só números de treino: nada de
 * peso, medida ou comparação entre irmãos além do desafio que a família
 * escolheu. Sessão que não conta como treino (`contaComoTreino`) fica de fora.
 */
export function montarResumo(
  perfis: { id: string; name: string; color: string; habito?: HabitoDoPerfil }[],
  todas: SessaoResumo[],
  desafio: Desafio | null,
) {
  const sessoes = todas.filter((s) =>
    contaComoTreino({ duration: s.durationSeconds, logs: s.logs }),
  );
  const blocos: BlocoPerfil[] = perfis.map((p) => {
    const minhas = sessoes.filter((s) => s.profileId === p.id);
    const habito = p.habito ? linhasDoHabito(p.habito, minhas.length > 0) : [];
    if (!minhas.length)
      return {
        id: p.id,
        nome: p.name,
        linhas: ["Não treinou nesta semana. Bora na próxima?", ...habito],
      };
    const reps = minhas.reduce((t, s) => t + s.logs.reduce((u, l) => u + l.reps, 0), 0);
    const minutos = Math.round(minhas.reduce((t, s) => t + s.durationSeconds, 0) / 60);
    const isometria = minhas.reduce((t, s) => t + s.logs.reduce((u, l) => u + l.holdSeconds, 0), 0);
    return {
      id: p.id,
      nome: p.name,
      linhas: [
        `${plural(minhas.length, "treino", "treinos")}, ${plural(minutos, "minuto", "minutos")} e ${plural(reps, "repetição", "repetições")}.`,
        ...(isometria ? [`${isometria} s de isometria somados.`] : []),
        ...habito,
      ],
    };
  });
  const resultado = desafio ? placar(desafio, sessoes, perfis) : null;
  const linhaDesafio =
    desafio && resultado
      ? resultado.concluido
        ? `Desafio da família cumprido: ${descreverDesafio(desafio)} (${resultado.total}).`
        : `Desafio da família: ${resultado.total} de ${desafio.target} em ${descreverDesafio(desafio)}.`
      : null;
  const treinou = blocos.length > 0 && sessoes.length > 0;
  return { blocos, linhaDesafio, treinou };
}

export function textoResumo(
  resumo: ReturnType<typeof montarResumo>,
  appUrl: string,
  unsubscribeUrl?: string,
) {
  return [
    "A semana do Bora Treinar",
    "",
    ...resumo.blocos.flatMap((b) => [b.nome, ...b.linhas, ""]),
    ...(resumo.linhaDesafio ? [resumo.linhaDesafio, ""] : []),
    `Abrir o app: ${appUrl}/perfis`,
    ...(unsubscribeUrl ? [`Para não receber mais este resumo: ${unsubscribeUrl}`] : []),
  ].join("\n");
}
