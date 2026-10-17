import { dayMonthLabel, daysBetweenIso, weekdayLong } from "@/features/dashboard/day-labels";
import type { RoutineBucketKey } from "@/features/unified-activities/routine-types";

/**
 * A vez da criança, recortada dos buckets de Hoje.
 *
 * `todo` é o "Para hoje" do adulto (vencidas, de hoje e sem data) mais o que
 * vence até o próximo dia de aula; `ahead` é o resto da semana, para quem quer
 * adiantar. Os três buckets vêm da mesma consulta da rotina, então o que a
 * criança vê é sempre um pedaço do que o responsável vê, nunca outra lista.
 */
export function splitKidTurn<T extends { item: { dueAt: string | null } }>(
  buckets: Record<RoutineBucketKey, T[]>,
  window: {
    nextSchoolDayIso: string;
    /**
     * O último dia de "A semana" em Hoje (hoje mais seis). O bucket da rotina
     * vai um dia além, e o "Quer adiantar?" contaria algo que o adulto não vê.
     */
    weekEndIso: string;
  },
): { todo: T[]; ahead: T[] } {
  // Amanhã e o resto da semana sempre têm data: o bucket sem data é `attention`.
  const later = [...buckets.tomorrow, ...buckets.week];
  const untilNextClass = (entry: T) =>
    entry.item.dueAt !== null && entry.item.dueAt <= window.nextSchoolDayIso;
  return {
    todo: [...buckets.attention, ...later.filter(untilNextClass)],
    ahead: later.filter(
      (entry) =>
        !untilNextClass(entry) &&
        entry.item.dueAt !== null &&
        entry.item.dueAt <= window.weekEndIso,
    ),
  };
}

/**
 * Quando é, nas palavras da criança: "É para hoje", "É para amanhã", "É para
 * segunda".
 *
 * Sem vermelho e sem "atrasada": para quem tem oito anos, "atrasada" não é
 * informação, é susto, e o prazo vencido continua existindo para os adultos,
 * em Hoje. Aqui ele vira "é para hoje". Sem data é um terceiro estado, e não
 * "hoje": dizer "é para hoje" numa atividade cuja data ninguém decidiu seria a
 * tela inventando o prazo que a IA é proibida de inventar.
 */
export function kidDueLabel(dueAt: string | null, todayIso: string): string {
  if (dueAt === null) return "Ainda sem data marcada";
  const distance = daysBetweenIso(todayIso, dueAt);
  if (distance <= 0) return "É para hoje";
  if (distance === 1) return "É para amanhã";
  // Até seis dias, o nome do dia basta. No sétimo ele cairia no mesmo dia da
  // semana de hoje, e "É para segunda" numa segunda confunde: aí vai a data,
  // por extenso, porque é uma frase para uma criança ler.
  const weekday = weekdayLong(dueAt).toLowerCase();
  if (distance < 7) return `É para ${weekday}`;
  return `É para ${weekday}, ${dayMonthLabel(dueAt, todayIso)}`;
}
