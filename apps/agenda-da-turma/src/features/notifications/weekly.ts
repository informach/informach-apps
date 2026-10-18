import { addDaysIso, parseLocalIso } from "@/features/dashboard/date";
import { daysBetweenIso, weekdayLong, weekRangeLabel } from "@/features/dashboard/day-labels";
import type { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { type DayLoad, formatDayLoad, summarizeDayLoad } from "@/features/unified-activities/load";
import type { RoutineMessageText } from "./digest";

/**
 * O resumo de domingo: a semana de aula que vem, enquanto ainda dá para
 * organizá-la.
 *
 * O resumo diário responde "o que é para amanhã", e responde tarde demais para
 * um trabalho que leva o fim de semana. Este responde "o que vem pela frente" e
 * aponta os dias cheios, a única informação que muda o que a família faz no
 * sábado.
 *
 * Puro: a montagem das linhas é testada sem banco, sem provedor e sem relógio.
 */
/** O mesmo teto de linhas do resumo diário. */
export const MAX_WEEKLY_LINES = 20;

export type WeeklyItem = {
  profileName: string;
  title: string;
  type: keyof typeof ACTIVITY_TYPE_LABELS;
  subjectName?: string | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  status?: string | null;
};

/**
 * A semana que o resumo descreve, como no canvas ("A semana de 19 a 23 de
 * outubro"): os dias de aula que vêm. De segunda a quinta, de hoje até sexta;
 * de sexta a domingo, a segunda a sexta seguinte. O sábado e o domingo daquela
 * semana entram só quando têm alguma coisa marcada.
 */
export function weeklyWindow(
  todayIso: string,
  items: ReadonlyArray<{ dueAt: string | null; status?: string | null }> = [],
): { fromIso: string; toIso: string } {
  const weekday = parseLocalIso(todayIso).getDay();
  const fromIso =
    weekday >= 1 && weekday <= 4
      ? todayIso
      : addDaysIso(todayIso, weekday === 5 ? 3 : weekday === 6 ? 2 : 1);
  const fridayIso = addDaysIso(fromIso, 5 - parseLocalIso(fromIso).getDay());
  const weekendDue = items
    .filter(
      (item) =>
        item.dueAt &&
        item.dueAt > fridayIso &&
        item.dueAt <= addDaysIso(fridayIso, 2) &&
        item.status !== "done" &&
        item.status !== "canceled",
    )
    .map((item) => item.dueAt as string)
    .sort();
  return { fromIso, toIso: weekendDue.at(-1) ?? fridayIso };
}

/** "Hoje", "Amanhã" ou "Quinta, 22". */
function dayLabel(iso: string, todayIso: string): string {
  const distance = daysBetweenIso(todayIso, iso);
  if (distance === 0) return "Hoje";
  if (distance === 1) return "Amanhã";
  return `${weekdayLong(iso)}, ${Number(iso.slice(8, 10))}`;
}

/** "quinta está cheia", "sábado está cheio", "amanhã está cheio". */
export function fullDayPhrase(iso: string, todayIso: string): string {
  const distance = daysBetweenIso(todayIso, iso);
  if (distance === 0) return "hoje está cheio";
  if (distance === 1) return "amanhã está cheio";
  const weekday = weekdayLong(iso).toLowerCase();
  // Segunda a sexta são "-feira": a quinta está cheia. Sábado e domingo, não.
  return weekday === "sábado" || weekday === "domingo"
    ? `${weekday} está cheio`
    : `${weekday} está cheia`;
}

function windowDays(fromIso: string, toIso: string) {
  return daysBetweenIso(fromIso, toIso) + 1;
}

function relevantItems<T extends WeeklyItem>(items: readonly T[], fromIso: string, toIso: string) {
  return items.filter(
    (item) =>
      item.dueAt &&
      item.dueAt >= fromIso &&
      item.dueAt <= toIso &&
      item.status !== "done" &&
      item.status !== "canceled",
  );
}

/**
 * A carga de cada dia, de hoje até o fim da semana do resumo, pela mesma conta de
 * Hoje e da Semana. A semana do título começa em `fromIso`, mas as linhas começam
 * em hoje: de sexta a domingo, o que vence antes da segunda não pode sumir.
 */
export function weeklyLoad(items: readonly WeeklyItem[], todayIso: string) {
  const { fromIso, toIso } = weeklyWindow(todayIso, items);
  return {
    fromIso,
    toIso,
    startIso: todayIso,
    window: summarizeDayLoad(items, { fromIso: todayIso, days: windowDays(todayIso, toIso) }),
  };
}

function fullDays(window: DayLoad[]) {
  return window.filter((day) => day.level === "cheio");
}

/**
 * Uma linha por dia com alguma coisa, mais um aviso dos dias cheios. É o texto
 * puro do e-mail (a versão sem HTML) e a base do assunto.
 *
 * Devolve lista vazia quando a semana está livre: um e-mail dizendo "nada esta
 * semana" é exatamente o tipo de mensagem que faz a família desligar os avisos.
 */
export function buildWeeklyDigestLines(
  items: readonly WeeklyItem[],
  options: { todayIso: string },
): string[] {
  const { startIso, toIso, window } = weeklyLoad(items, options.todayIso);
  const relevant = relevantItems(items, startIso, toIso);
  if (!relevant.length) return [];

  const lines = window
    .filter((day) => day.deliveries + day.study > 0)
    .map((day) => {
      const ofDay = relevant.filter((item) => item.dueAt === day.iso);
      const detail = ofDay
        .map((item) =>
          item.subjectName
            ? `${item.profileName} · ${item.subjectName}: ${item.title}`
            : `${item.profileName}: ${item.title}`,
        )
        .join("; ");
      return `${dayLabel(day.iso, options.todayIso)}: ${formatDayLoad(day)}. ${detail}.`;
    });

  const full = fullDays(window);
  if (full.length)
    lines.push(
      `Dias mais puxados: ${full
        .map((day) => `${dayLabel(day.iso, options.todayIso)} (${formatDayLoad(day)})`)
        .join(", ")}.`,
    );
  // Mesmo teto do resumo diário: uma casa com três filhos e sete dias pela
  // frente geraria um e-mail sem fim, que ninguém lê e alguns provedores cortam.
  return lines.length > MAX_WEEKLY_LINES
    ? [
        ...lines.slice(0, MAX_WEEKLY_LINES),
        `Mais ${lines.length - MAX_WEEKLY_LINES} dias na agenda. Abra a Agenda para ver a semana inteira.`,
      ]
    : lines;
}

/**
 * O resumo da semana inteiro: título, linhas e o texto da tela bloqueada.
 *
 * O título já diz o dia cheio, porque é a única coisa que muda o fim de semana
 * da família e muita gente lê só o assunto. O push leva contagem e dia da
 * semana, nunca nome de criança ou de atividade (ver `digest.ts`).
 */
export function buildWeeklyDigest(
  items: readonly WeeklyItem[],
  options: { todayIso: string },
): RoutineMessageText | null {
  const lines = buildWeeklyDigestLines(items, options);
  if (!lines.length) return null;
  const today = options.todayIso;
  const { fromIso, toIso, startIso, window } = weeklyLoad(items, today);
  const firstFull = fullDays(window)[0];
  const total = relevantItems(items, startIso, toIso).length;
  const range = weekRangeLabel(fromIso, toIso);
  const fullPhrase = firstFull ? fullDayPhrase(firstFull.iso, today) : null;
  return {
    title: fullPhrase ? `De ${range}: ${fullPhrase}` : `A semana de ${range}`,
    lines,
    push: {
      title: "A semana que vem na Agenda",
      body: `${total === 1 ? "1 atividade" : `${total} atividades`} até ${weekdayLong(
        toIso,
      ).toLowerCase()}, dia ${Number(toIso.slice(8, 10))}.${
        fullPhrase ? ` ${fullPhrase.charAt(0).toUpperCase()}${fullPhrase.slice(1)}.` : ""
      }`,
    },
  };
}
