import { addDaysIso } from "@/features/dashboard/date";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { formatDayLoad, summarizeDayLoad } from "@/features/unified-activities/load";

/**
 * O resumo de domingo: a semana que vem, enquanto ainda dá para organizá-la.
 *
 * O resumo diário responde "o que é para amanhã", e responde tarde demais para
 * um trabalho que leva o fim de semana. Este responde "o que vem pela frente" e
 * aponta os dias cheios — a única informação que muda o que a família faz no
 * sábado.
 *
 * Puro: a montagem das linhas é testada sem banco, sem provedor e sem relógio.
 */
export const WEEKLY_DIGEST_DAYS = 7;
/** O mesmo teto de linhas do resumo diário. */
export const MAX_WEEKLY_LINES = 20;

export type WeeklyItem = {
  profileName: string;
  title: string;
  type: keyof typeof ACTIVITY_TYPE_LABELS;
  dueAt: string | null;
  estimatedMinutes: number | null;
  status?: string | null;
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Hoje";
  if (iso === addDaysIso(todayIso, 1)) return "Amanhã";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${weekday} (${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")})`;
}

/**
 * Uma linha por dia com alguma coisa, mais um aviso por dia cheio.
 *
 * Devolve lista vazia quando a semana está livre: um e-mail dizendo "nada esta
 * semana" é exatamente o tipo de mensagem que faz a família desligar os avisos.
 */
export function buildWeeklyDigestLines(
  items: readonly WeeklyItem[],
  options: { todayIso: string },
): string[] {
  const window = summarizeDayLoad(items, { fromIso: options.todayIso, days: WEEKLY_DIGEST_DAYS });
  const lastIso = addDaysIso(options.todayIso, WEEKLY_DIGEST_DAYS - 1);
  const relevant = items.filter(
    (item) =>
      item.dueAt &&
      item.dueAt >= options.todayIso &&
      item.dueAt <= lastIso &&
      item.status !== "done" &&
      item.status !== "canceled",
  );
  if (!relevant.length) return [];

  const lines = window
    .filter((day) => day.deliveries + day.study > 0)
    .map((day) => {
      const ofDay = relevant.filter((item) => item.dueAt === day.iso);
      const detail = ofDay
        .map((item) => `${item.profileName}: ${ACTIVITY_TYPE_LABELS[item.type]}, ${item.title}`)
        .join("; ");
      return `${dayLabel(day.iso, options.todayIso)} — ${formatDayLoad(day)}. ${detail}.`;
    });

  const full = window.filter((day) => day.level === "cheio");
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
        `Mais ${lines.length - MAX_WEEKLY_LINES} linhas na agenda. Abra o app para ver a semana inteira.`,
      ]
    : lines;
}
