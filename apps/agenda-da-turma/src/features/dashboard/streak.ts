import { addDaysIso } from "./date";

/**
 * A sequência da FAMÍLIA, nunca da criança.
 *
 * É a peça motivacional das referências (o "Learning Streak! 3 days in a row"),
 * adaptada à regra do app: nenhuma pontuação ou competição entre crianças. Numa
 * conta há irmãos de idades diferentes, e um número por criança vira aparelho de
 * comparação dentro de casa. O número é da casa inteira.
 *
 * Um dia entra na sequência quando a família concluiu **alguma coisa** nele —
 * não "zerou o dia". Fechar tudo todo dia não é uma meta honesta para uma
 * família com três filhos; aparecer é.
 */

/** Quantos dias a sequência pode alcançar. Além disso o número deixa de dizer algo. */
export const STREAK_LOOKBACK_DAYS = 60;

/**
 * Conta a sequência a partir das datas em que houve conclusão.
 *
 * `completionDates` é um conjunto de dias "YYYY-MM-DD"; a ordem não importa.
 *
 * A contagem começa em hoje se hoje já teve conclusão, e em ontem se não teve —
 * senão a sequência de quem cuidou da rotina todos os dias apareceria zerada
 * toda manhã, antes de a família fazer qualquer coisa. Ela só quebra de fato
 * quando um dia inteiro passa em branco.
 */
export function countStreakDays(completionDates: Iterable<string>, todayIso: string): number {
  const days = new Set(completionDates);
  if (days.size === 0) return 0;

  let cursor = days.has(todayIso) ? todayIso : addDaysIso(todayIso, -1);
  let streak = 0;
  while (days.has(cursor) && streak < STREAK_LOOKBACK_DAYS) {
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }
  return streak;
}
