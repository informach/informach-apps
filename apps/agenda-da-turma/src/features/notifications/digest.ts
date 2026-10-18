import { addDaysIso } from "@/features/dashboard/date";
import {
  dayDistance,
  daysBetweenIso,
  formatClockTime,
  shortDayLabel,
  weekdayLong,
} from "@/features/dashboard/day-labels";

/**
 * O texto do resumo diário e do lembrete.
 *
 * Duas mensagens saem de cada aviso: o corpo do e-mail, que a família lê
 * dentro da caixa dela e pode nomear a criança, e o que aparece na tela
 * bloqueada: o push inteiro e o ASSUNTO do e-mail, que o aplicativo de e-mail
 * também mostra ali. A política de privacidade promete que a tela bloqueada
 * não mostra nome de criança nem conteúdo escolar, então assunto e push levam
 * só contagens e dias. As versões nascem aqui, juntas, para que uma mudança no
 * texto de uma não esqueça a promessa da outra.
 *
 * Puro: testado sem banco, sem provedor e sem relógio.
 */

export type DigestItem = {
  profileName: string;
  title: string;
  subjectName: string | null;
  dueAt: string | null;
  time: string | null;
  assignedName: string | null;
};

export type PushText = { title: string; body: string };
export type RoutineMessageText = { title: string; lines: string[]; push: PushText };

/** O teto de linhas de um e-mail: uma casa com três filhos não pode virar um e-mail sem fim. */
export const MAX_DIGEST_LINES = 20;

function count(n: number, one: string, many: string) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function atTime(time: string | null) {
  return time ? ` às ${formatClockTime(time)}` : "";
}

/** "para hoje às 8h", "para amanhã", "passou do prazo (sex, 16)", "sem data marcada". */
export function whenPhrase(item: Pick<DigestItem, "dueAt" | "time">, todayIso: string): string {
  if (!item.dueAt) return "sem data marcada";
  switch (dayDistance(item.dueAt, todayIso)) {
    case "late":
      return `passou do prazo (${shortDayLabel(item.dueAt, todayIso)})`;
    case "today":
      return `para hoje${atTime(item.time)}`;
    case "tomorrow":
      return `para amanhã${atTime(item.time)}`;
    default:
      return `para ${shortDayLabel(item.dueAt, todayIso)}${atTime(item.time)}`;
  }
}

/** "Clara · Matemática: Páginas 32 e 33, para hoje. Ana cuida." */
export function digestLine(item: DigestItem, todayIso: string): string {
  const who = item.subjectName ? `${item.profileName} · ${item.subjectName}` : item.profileName;
  const owner = item.assignedName ? ` ${item.assignedName} cuida.` : "";
  return `${who}: ${item.title}, ${whenPhrase(item, todayIso)}.${owner}`;
}

/** Ordem de leitura: o que passou, o de hoje, o sem data e, por último, amanhã. */
function rank(item: DigestItem, todayIso: string): number {
  if (!item.dueAt) return 2;
  const distance = dayDistance(item.dueAt, todayIso);
  if (distance === "late") return 0;
  if (distance === "today") return 1;
  return 3;
}

function capLines(lines: string[]): string[] {
  return lines.length > MAX_DIGEST_LINES
    ? [
        ...lines.slice(0, MAX_DIGEST_LINES),
        `Mais ${count(lines.length - MAX_DIGEST_LINES, "atividade", "atividades")}. Abra a Agenda para ver todas.`,
      ]
    : lines;
}

/**
 * "2 para hoje, 1 atrasada, 1 sem data e 3 para amanhã": cada grupo com o seu
 * nome, para o assunto e o push não chamarem de "hoje" o que está sem data.
 */
function digestCounts(items: readonly DigestItem[], todayIso: string) {
  const tomorrow = addDaysIso(todayIso, 1);
  const forToday = items.filter((item) => item.dueAt === todayIso).length;
  const late = items.filter((item) => item.dueAt && item.dueAt < todayIso).length;
  const undated = items.filter((item) => !item.dueAt).length;
  const forTomorrow = items.filter((item) => item.dueAt === tomorrow).length;
  const parts: string[] = [];
  if (forToday) parts.push(`${forToday} para hoje`);
  if (late) parts.push(late === 1 ? "1 atrasada" : `${late} atrasadas`);
  if (undated) parts.push(`${undated} sem data`);
  if (forTomorrow) parts.push(`${forTomorrow} para amanhã`);
  return joinWithAnd(parts);
}

/**
 * O resumo do dia: o que é para hoje (inclusive o que passou e o que está sem
 * data) e o que é para amanhã. Devolve `null` quando não há nada, porque um
 * e-mail dizendo "nada hoje" ensina a família a ignorar os seguintes.
 */
export function buildDailyDigest(
  items: readonly DigestItem[],
  options: { todayIso: string },
): RoutineMessageText | null {
  const today = options.todayIso;
  const tomorrow = addDaysIso(today, 1);
  const relevant = items.filter((item) => !item.dueAt || item.dueAt <= tomorrow);
  if (!relevant.length) return null;

  const sorted = [...relevant].sort((a, b) => {
    const byRank = rank(a, today) - rank(b, today);
    if (byRank !== 0) return byRank;
    return `${a.dueAt ?? ""}${a.time ?? ""}`.localeCompare(`${b.dueAt ?? ""}${b.time ?? ""}`);
  });
  const summary = digestCounts(sorted, today);

  return {
    title: `Na Agenda: ${summary}`,
    lines: capLines(sorted.map((item) => digestLine(item, today))),
    push: { title: "O resumo do dia na Agenda", body: `${capitalizeFirst(summary)}.` },
  };
}

/**
 * O lembrete de uma atividade, com hora marcada pela família.
 *
 * O assunto não nomeia a criança nem a atividade (ele aparece na tela
 * bloqueada); o corpo do e-mail nomeia.
 */
export function buildReminder(item: DigestItem, options: { todayIso: string }): RoutineMessageText {
  const today = options.todayIso;
  let when: string;
  if (!item.dueAt) when = "está sem data marcada";
  else {
    const distance = dayDistance(item.dueAt, today);
    when =
      distance === "late"
        ? "passou do prazo"
        : distance === "today"
          ? "é para hoje"
          : distance === "tomorrow"
            ? "é para amanhã"
            : // O dia da semana só ajuda dentro da semana; mais longe, a data.
              daysBetweenIso(today, item.dueAt) < 7
              ? `é para ${weekdayLong(item.dueAt).toLowerCase()}`
              : `é para ${shortDayLabel(item.dueAt, today)}`;
  }
  const sentence = `Uma atividade ${when}.`;
  return {
    title: `Lembrete da Agenda: uma atividade ${when}`,
    lines: [digestLine(item, today)],
    push: { title: "Lembrete da Agenda", body: sentence },
  };
}

export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function capitalizeFirst(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
