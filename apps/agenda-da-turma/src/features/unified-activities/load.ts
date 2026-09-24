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
 * Puro e sem banco: a mesma contagem serve ao bucket da rotina, ao resumo de
 * domingo e ao plano de estudo, e as três precisam concordar. Concordar não é
 * só chamar a mesma função: é receber a mesma janela e o mesmo conjunto de
 * itens. Por isso a janela mora aqui (`LOAD_WINDOW_DAYS`) em vez de cada
 * consumidor escolher a sua.
 */
export type DayLoad = {
  iso: string;
  /** Entregas: tudo que a escola ou a família cobra num prazo. */
  deliveries: number;
  /** Sessões de estudo — ocupam o dia, mas ninguém as "entrega". */
  study: number;
  /** Soma das estimativas informadas. Zero quando ninguém estimou. */
  minutes: number;
  level: "leve" | "cheio";
};

/** Um dia é "cheio" com três entregas OU uma hora e meia estimada. */
export const FULL_DAY_COUNT = 3;
export const FULL_DAY_MINUTES = 90;

/**
 * Sete dias, para todo mundo.
 *
 * O painel usava oito e alimentava a contagem só com o bucket "o resto da
 * semana" — então hoje e amanhã eram estruturalmente zero, e numa sexta-feira
 * ele não avisava que o sábado tinha três entregas. O resumo de domingo usava
 * sete e todos os itens. Duas respostas para a mesma pergunta, com a função
 * compartilhada no meio delas.
 */
export const LOAD_WINDOW_DAYS = 7;

export type LoadItem = {
  dueAt: string | null;
  estimatedMinutes: number | null;
  status?: string | null;
  type?: string | null;
};

export function summarizeDayLoad(
  items: Iterable<LoadItem>,
  options: { fromIso: string; days?: number },
): DayLoad[] {
  const days = options.days ?? LOAD_WINDOW_DAYS;
  const byDay = new Map<string, { deliveries: number; study: number; minutes: number }>();
  for (let offset = 0; offset < days; offset += 1)
    byDay.set(addDaysIso(options.fromIso, offset), { deliveries: 0, study: 0, minutes: 0 });
  for (const item of items) {
    if (!item.dueAt || item.status === "done" || item.status === "canceled") continue;
    const day = byDay.get(item.dueAt);
    if (!day) continue;
    // Sessão de estudo ocupa o dia e por isso soma minutos, mas não conta como
    // entrega: três sessões que a própria família marcou não podem virar um
    // aviso de "dia cheio" sobre o dia que ela reservou para estudar.
    if (item.type === "study") day.study += 1;
    else day.deliveries += 1;
    if (item.estimatedMinutes && item.estimatedMinutes > 0) day.minutes += item.estimatedMinutes;
  }
  return [...byDay.entries()].map(([iso, { deliveries, study, minutes }]) => ({
    iso,
    deliveries,
    study,
    minutes,
    level: deliveries >= FULL_DAY_COUNT || minutes >= FULL_DAY_MINUTES ? "cheio" : "leve",
  }));
}

/** "3 entregas · ~1h30", ou "2 sessões de estudo", ou as duas coisas. */
export function formatDayLoad(day: DayLoad): string {
  const parts: string[] = [];
  if (day.deliveries > 0)
    parts.push(day.deliveries === 1 ? "1 entrega" : `${day.deliveries} entregas`);
  if (day.study > 0)
    parts.push(day.study === 1 ? "1 sessão de estudo" : `${day.study} sessões de estudo`);
  const label = parts.length > 0 ? parts.join(" e ") : "nada marcado";
  return day.minutes > 0 ? `${label} · ~${formatEstimate(day.minutes)}` : label;
}
