import { appHour, todayLocalIso } from "@/features/dashboard/date";
import { dayMonthLabel, daysBetweenIso, weekdayLong } from "@/features/dashboard/day-labels";
import { countWord } from "@/features/dashboard/routine-summary";

/**
 * As palavras da revisão e do "Pronto" do recado, puras e testadas: "Achei 4
 * provas para Clara", "Salvar 4 provas", "A primeira é quinta, 22" e a frase
 * dos lembretes. Quando as atividades são todas do mesmo tipo, a tela diz o
 * tipo; misturadas, diz "atividades".
 */

const SINGULAR: Record<string, string> = {
  task: "tarefa",
  exam: "prova",
  project: "trabalho",
  reminder: "lembrete",
  material: "material",
  authorization: "autorização",
  event: "evento",
  study: "sessão de estudo",
};
const PLURAL: Record<string, string> = {
  task: "tarefas",
  exam: "provas",
  project: "trabalhos",
  reminder: "lembretes",
  material: "materiais",
  authorization: "autorizações",
  event: "eventos",
  study: "sessões de estudo",
};

/** O tipo comum a todas, ou `null` quando são de tipos diferentes. */
function commonType(types: readonly string[]) {
  const [first] = types;
  return first && types.every((type) => type === first) ? first : null;
}

/** "4 provas", "1 prova", "3 atividades". */
export function countedNoun(types: readonly string[]): string {
  const type = commonType(types);
  const count = types.length;
  if (count === 1) return `1 ${(type && SINGULAR[type]) ?? "atividade"}`;
  return `${count} ${(type && PLURAL[type]) ?? "atividades"}`;
}

/** "prova", para "dois dias antes de cada prova"; "atividade" quando misturadas. */
export function singularNoun(types: readonly string[]): string {
  const type = commonType(types);
  return (type && SINGULAR[type]) ?? "atividade";
}

/** "provas", para "recebem as mesmas provas"; "atividades" quando misturadas. */
export function pluralNoun(types: readonly string[]): string {
  const type = commonType(types);
  return (type && PLURAL[type]) ?? "atividades";
}

/** "quinta, 22" perto de hoje; "quinta, 5 de novembro" quando está longe. */
function dayPhrase(iso: string, todayIso: string) {
  const near = Math.abs(daysBetweenIso(todayIso, iso)) <= 20;
  return `${weekdayLong(iso).toLowerCase()}, ${near ? Number(iso.slice(8)) : dayMonthLabel(iso, todayIso)}`;
}

/** "A primeira é quinta, 22." ou, com uma só, "É para quinta, 22." */
export function firstDueSentence(count: number, firstDue: string, todayIso: string): string {
  return `${count === 1 ? "É para" : "A primeira é"} ${dayPhrase(firstDue, todayIso)}.`;
}

type ReminderItem = { type: string; dueAt: string | null; reminderAt: string | null };

/**
 * "Os lembretes chegam dois dias antes de cada prova, às 19h." quando todos
 * seguem a mesma regra; "Os lembretes chegam no horário marcado." quando não.
 * Só conta lembrete que ainda vai chegar.
 */
export function remindersSentence(items: readonly ReminderItem[], now: Date = new Date()): string {
  const upcoming = items.filter(
    (item): item is ReminderItem & { reminderAt: string } =>
      Boolean(item.reminderAt) && new Date(item.reminderAt as string).valueOf() > now.valueOf(),
  );
  if (upcoming.length === 0) return "";
  const rules = upcoming.map((item) => {
    const at = new Date(item.reminderAt);
    const minutes = at.getUTCMinutes();
    return item.dueAt && minutes === 0
      ? `${daysBetweenIso(todayLocalIso(at), item.dueAt)}|${appHour(at)}`
      : null;
  });
  const [rule] = rules;
  const one = upcoming.length === 1;
  const subject = one ? "O lembrete chega" : "Os lembretes chegam";
  if (!rule || rules.some((other) => other !== rule)) return `${subject} no horário marcado.`;
  const [days, hour] = rule.split("|").map(Number);
  if (days === undefined || hour === undefined || days < 0) return `${subject} no horário marcado.`;
  const when =
    days === 0
      ? "no dia"
      : `${days === 1 ? "um dia" : days === 2 ? "dois dias" : `${countWord(days)} dias`} antes`;
  const each = one ? "" : ` de cada ${singularNoun(upcoming.map((item) => item.type))}`;
  return `${subject} ${when}${days === 0 ? "" : each}, às ${hour}h.`;
}
