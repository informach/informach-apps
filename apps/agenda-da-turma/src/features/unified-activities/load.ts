import { addDaysIso } from "@/features/dashboard/date";
import { formatEstimate } from "./estimate";

/**
 * A carga de cada dia da semana que vem.
 *
 * A rotina já dizia o que tem para fazer e quando; não dizia que a terça tem
 * três entregas e a quinta nenhuma. Quem descobre isso na terça de manhã não
 * tem mais o que fazer a respeito — e o remédio (adiantar no fim de semana)
 * depende de saber antes.
 *
 * Puro e sem banco: a mesma contagem serve à vista semanal, ao bucket da
 * rotina e ao resumo de domingo, e as três precisam concordar.
 */
export type DayLoad = {
  iso: string;
  count: number;
  /** Soma das estimativas informadas. Zero quando ninguém estimou. */
  minutes: number;
  level: "leve" | "cheio";
};

/** Um dia é "cheio" com três entregas OU uma hora e meia estimada. */
export const FULL_DAY_COUNT = 3;
export const FULL_DAY_MINUTES = 90;

export type LoadItem = {
  dueAt: string | null;
  estimatedMinutes: number | null;
  status?: string | null;
};

export function summarizeDayLoad(
  items: Iterable<LoadItem>,
  options: { fromIso: string; days: number },
): DayLoad[] {
  const byDay = new Map<string, { count: number; minutes: number }>();
  for (let offset = 0; offset < options.days; offset += 1)
    byDay.set(addDaysIso(options.fromIso, offset), { count: 0, minutes: 0 });
  for (const item of items) {
    if (!item.dueAt || item.status === "done" || item.status === "canceled") continue;
    const day = byDay.get(item.dueAt);
    if (!day) continue;
    day.count += 1;
    if (item.estimatedMinutes && item.estimatedMinutes > 0) day.minutes += item.estimatedMinutes;
  }
  return [...byDay.entries()].map(([iso, { count, minutes }]) => ({
    iso,
    count,
    minutes,
    level: count >= FULL_DAY_COUNT || minutes >= FULL_DAY_MINUTES ? "cheio" : "leve",
  }));
}

/** "3 entregas · ~1h30", ou só a contagem quando ninguém estimou. */
export function formatDayLoad(day: DayLoad): string {
  const entregas = day.count === 1 ? "1 entrega" : `${day.count} entregas`;
  return day.minutes > 0 ? `${entregas} · ~${formatEstimate(day.minutes)}` : entregas;
}
