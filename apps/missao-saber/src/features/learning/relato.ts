import { type Evidence, localDay, type SkillState } from "./engine";

/**
 * Relato semanal do responsável, em frases.
 *
 * A área da família mostrava quatro fragmentos em caixas e uma tabela. A
 * proposta do produto (§6) pedia uma leitura: "resolveu três problemas novos
 * de comparação de preços sem ajuda; ainda precisa representar a fração antes
 * de calcular; na próxima semana vamos trabalhar essa ponte".
 *
 * Esta função compõe exatamente essa leitura por regras — sem IA, sem custo e
 * testável. O vocabulário é fechado de propósito: nenhuma frase aqui adjetiva
 * a criança nem alega domínio. Cada número citado vem da mesma evidência que a
 * tabela abaixo dela exibe.
 */

export type WeeklyCounts = {
  total: number;
  correct: number;
  withHelp: number;
  practiceDays: number;
  sessions: number;
};

export type WeeklyNarrative = {
  /** Parágrafos curtos, na ordem de leitura. Sempre ao menos um. */
  linhas: string[];
};

const dayMs = 86_400_000;

function plural(count: number, singular: string, many: string) {
  return count === 1 ? singular : many;
}

/** Janela de sete dias de calendário local encerrada em `now`, como `weeklyEvidence`. */
function inWeek(row: Evidence, now: Date) {
  const today = localDay(now);
  const firstDay = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * dayMs)
    .toISOString()
    .slice(0, 10);
  const day = localDay(row.createdAt);
  return row.createdAt <= now && day >= firstDay && day <= today;
}

export function weeklyNarrative(input: {
  nickname: string;
  evidence: Evidence[];
  weekly: WeeklyCounts;
  states: SkillState[];
  repeatedDifficulties: { skillId: string }[];
  nextSkillId?: string;
  reflections: number;
  now: Date;
  skillNames: Record<string, string>;
}): WeeklyNarrative {
  const { nickname, evidence, weekly, repeatedDifficulties, reflections, now } = input;
  const name = (skillId: string) => input.skillNames[skillId] ?? skillId;

  if (!evidence.length && !reflections)
    return {
      linhas: [`O relato de ${nickname} começa depois das primeiras missões.`],
    };

  /* Primeiro acerto sem pistas em uma atividade inédita: a mesma definição de
     evidência independente usada por `skillStates`. Diagnóstico fica fora. */
  const firstSeen = new Map<string, Evidence>();
  for (const row of [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
    if (!firstSeen.has(row.itemId)) firstSeen.set(row.itemId, row);
  const novelties = evidence.filter(
    (row) =>
      row.mode !== "diagnostic" &&
      row.correct &&
      row.helpCount === 0 &&
      firstSeen.get(row.itemId) === row &&
      inWeek(row, now),
  );
  /* O número citado é de atividades, porque é isso que a frase diz: "resolveu N
     problemas novos". A diversidade de famílias é a medida de autonomia e vive
     no selo e na tabela, não nesta contagem. */
  const noveltyCount = novelties.length;
  /* A habilidade nomeada é a de mais atividades novas e, no empate, a mais
     recente — a que a criança estava trabalhando por último. O nome da
     habilidade em ordem alfabética só decide um empate duplo, para a frase ser
     estável entre duas leituras do mesmo relato. */
  const bySkill = new Map<string, { count: number; last: number }>();
  for (const row of novelties) {
    const current = bySkill.get(row.skillId) ?? { count: 0, last: 0 };
    bySkill.set(row.skillId, {
      count: current.count + 1,
      last: Math.max(current.last, row.createdAt.getTime()),
    });
  }
  const ranked = [...bySkill].sort(
    (a, b) => b[1].count - a[1].count || b[1].last - a[1].last || a[0].localeCompare(b[0]),
  );
  const strongest = ranked[0];

  const linhas: string[] = [];

  if (strongest && noveltyCount > 0) {
    /* Os dias citados são os dias EM QUE ESSES problemas foram resolvidos, não
       os dias com alguma prática: a frase diz "resolveu N problemas novos ... em
       D dias", e usar `practiceDays` espalharia as descobertas por dias em que
       elas não aconteceram. */
    const days = new Set(novelties.map((row) => localDay(row.createdAt))).size;
    const others = ranked.length - 1;
    const where = !others
      ? name(strongest[0])
      : others === 1
        ? `${name(strongest[0])} e outra habilidade`
        : `${name(strongest[0])} e outras ${others} habilidades`;
    linhas.push(
      `Nesta semana, ${nickname} resolveu ${noveltyCount} ${plural(
        noveltyCount,
        "problema novo",
        "problemas novos",
      )} de ${where} sem pistas, em ${days} ${plural(days, "dia de estudo", "dias diferentes")}.`,
    );
  } else if (weekly.total > 0) {
    linhas.push(
      `Nesta semana, ${nickname} registrou ${weekly.total} ${plural(
        weekly.total,
        "tentativa",
        "tentativas",
      )} em ${weekly.practiceDays} ${plural(
        weekly.practiceDays,
        "dia",
        "dias",
      )}, ${weekly.withHelp} com pistas. Nenhuma foi um primeiro acerto sem pistas em uma atividade inédita.`,
    );
  } else {
    linhas.push(`Nesta semana ${nickname} não registrou tentativas.`);
  }

  if (repeatedDifficulties.length)
    linhas.push(
      `Ainda precisa de apoio em ${repeatedDifficulties
        .map((difficulty) => name(difficulty.skillId))
        .join(", ")}.`,
    );
  else if (weekly.total > 0)
    linhas.push("Nenhuma dificuldade repetida apareceu nas últimas quatro semanas.");

  const due = input.states.filter((state) => state.dueOn <= localDay(now));
  if (input.nextSkillId)
    linhas.push(
      due.length
        ? `O próximo passo é ${name(input.nextSkillId)}, e ${due.length} ${plural(
            due.length,
            "habilidade está",
            "habilidades estão",
          )} na data de reencontro.`
        : `O próximo passo é ${name(input.nextSkillId)}.`,
    );
  else
    linhas.push(
      due.length
        ? `${due.length} ${plural(due.length, "habilidade está", "habilidades estão")} na data de reencontro.`
        : "O próximo passo é retomar as habilidades nas datas de revisão.",
    );

  if (reflections)
    linhas.push(
      `${reflections} ${plural(reflections, "reflexão escrita ficou", "reflexões escritas ficaram")} registrada${plural(
        reflections,
        "",
        "s",
      )}, sem nota automática.`,
    );

  return { linhas };
}
