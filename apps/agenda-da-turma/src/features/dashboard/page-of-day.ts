import { shortDayLabel } from "./day-labels";
import { countWord, describeThing, joinWords } from "./routine-summary";

/**
 * O que Hoje monta a partir da rotina, puro e testado: a mochila de amanhã por
 * criança e as linhas de "A semana" no computador.
 */

type TomorrowSubject = { id: string; name: string };
type ScheduleView = { profileId: string; profileName: string; subjects: TomorrowSubject[] };
type Thing = {
  profileId: string;
  profileName: string;
  type: string;
  title: string;
  subjectName: string | null;
  dueAt: string | null;
  time: string | null;
  estimatedMinutes: number | null;
};

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "Levar rolo de papel e cola" vira "rolo de papel e cola": a mochila diz o que vai nela. */
function packedThing(title: string) {
  return lowerFirst(title.replace(/^(levar|trazer|separar|mandar)\s+/i, "").trim());
}

export type BackpackChild = {
  profileId: string;
  profileName: string;
  /** As aulas de amanhã ("Português e Ciências"). */
  subjects: string[];
  /** O que vai na mochila: materiais de amanhã e o "levar sempre" das aulas. */
  items: string[];
  /** Quando tudo vem do "levar sempre" de uma aula só: "de natação". */
  onlyFrom: string | null;
  /** O "levar sempre" por aula, para a noite ("Levar sempre na natação"). */
  kits: Array<{ subject: string; items: string[] }>;
};

export function buildBackpack(input: {
  schedule: readonly ScheduleView[];
  kits: Record<string, string[]>;
  /** As atividades de amanhã (o bucket `tomorrow`). */
  tomorrow: readonly Thing[];
}): BackpackChild[] {
  const children = new Map<string, BackpackChild>();
  for (const view of input.schedule) {
    const kits = view.subjects.flatMap((subject) => {
      const items = (input.kits[`${view.profileId}:${subject.id}`] ?? []).filter(Boolean);
      return items.length ? [{ subject: subject.name, items: items.map(lowerFirst) }] : [];
    });
    children.set(view.profileId, {
      profileId: view.profileId,
      profileName: view.profileName,
      subjects: view.subjects.map((subject) => subject.name),
      items: kits.flatMap((kit) => kit.items),
      onlyFrom: null,
      kits,
    });
  }
  // Toda criança com algo amanhã entra, mesmo sem aula nem material: à noite os
  // cards de amanhã moram na linha dela, e uma prova sem turma sumiria.
  const withTomorrow = new Set<string>();
  for (const thing of input.tomorrow) {
    withTomorrow.add(thing.profileId);
    const child = children.get(thing.profileId) ?? {
      profileId: thing.profileId,
      profileName: thing.profileName,
      subjects: [],
      items: [],
      onlyFrom: null,
      kits: [],
    };
    if (thing.type === "material") child.items.unshift(packedThing(thing.title));
    children.set(thing.profileId, child);
  }
  return [...children.values()]
    .map((child) => ({
      ...child,
      onlyFrom:
        child.kits.length === 1 && child.items.length === child.kits[0]?.items.length
          ? lowerFirst(child.kits[0].subject)
          : null,
    }))
    .filter(
      (child) =>
        child.items.length > 0 || child.subjects.length > 0 || withTomorrow.has(child.profileId),
    );
}

/** "Clara: rolo de papel e cola." e "Miguel: touca, óculos e toalha de natação." */
export function backpackLine(child: BackpackChild): string {
  return `${child.profileName}: ${joinWords(child.items)}${child.onlyFrom ? ` de ${child.onlyFrom}` : ""}.`;
}

/** "Clara leva rolo de papel e cola. Miguel leva touca, óculos e toalha." */
export function backpackSentence(children: readonly BackpackChild[]): string {
  return children
    .filter((child) => child.items.length > 0)
    .map((child) => `${child.profileName} leva ${joinWords(child.items)}.`)
    .join(" ");
}

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

function estimateText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

function clock(time: string) {
  const [hour, minute] = time.split(":");
  return minute && minute !== "00" ? `${Number(hour)}h${minute}` : `${Number(hour)}h`;
}

export type WeekRow = {
  iso: string;
  label: string;
  today: boolean;
  full: boolean;
  /** Em negrito antes do texto: "Dia cheio:". */
  lead: string | null;
  text: string;
};

/**
 * "A semana" no computador: um dia por linha, de hoje em diante, só os dias
 * com alguma coisa (e hoje, sempre). Hoje conta o que está aberto e o que
 * passou; o dia cheio avisa; um dia com uma coisa só diz qual.
 */
export function weekRows(input: {
  todayIso: string;
  days: ReadonlyArray<{ iso: string; full: boolean }>;
  things: readonly Thing[];
  openToday: number;
  lateToday: number;
}): WeekRow[] {
  return input.days.flatMap((day): WeekRow[] => {
    const label = shortDayLabel(day.iso, input.todayIso);
    if (day.iso === input.todayIso) {
      const open = input.openToday - input.lateToday;
      const parts = [
        open > 0 ? (open === 1 ? "1 coisa" : `${open} coisas`) : null,
        input.lateToday > 0
          ? `${input.lateToday} ${input.lateToday === 1 ? "atrasada" : "atrasadas"}`
          : null,
      ].filter(Boolean);
      return [
        {
          iso: day.iso,
          label,
          today: true,
          full: day.full,
          lead: null,
          text: parts.length ? parts.join(", ") : "Nada aberto",
        },
      ];
    }
    const ofDay = input.things.filter((thing) => thing.dueAt === day.iso);
    if (ofDay.length === 0) return [];
    const types = new Set(ofDay.map((thing) => thing.type));
    const count =
      types.size === 1
        ? `${ofDay.length} ${PLURAL[ofDay[0]?.type ?? ""] ?? "coisas"}`
        : `${ofDay.length} coisas`;
    if (day.full)
      return [{ iso: day.iso, label, today: false, full: true, lead: "Dia cheio:", text: count }];
    if (ofDay.length > 1)
      return [{ iso: day.iso, label, today: false, full: false, lead: null, text: count }];
    const [only] = ofDay;
    if (!only) return [];
    const name = describeThing(only);
    const extra = only.time
      ? `, ${clock(only.time)}`
      : only.estimatedMinutes
        ? `, ${estimateText(only.estimatedMinutes)}`
        : "";
    return [
      {
        iso: day.iso,
        label,
        today: false,
        full: false,
        lead: null,
        text: `${name.charAt(0).toUpperCase()}${name.slice(1)}${extra}`,
      },
    ];
  });
}

/**
 * A frase do dia cheio, embaixo da faixa da semana no celular: "prova de
 * Português de Clara e prova de Inglês de Miguel". Com mais de duas coisas,
 * conta ("três entregas").
 */
export function fullDayDetail<
  T extends Pick<Thing, "type" | "title" | "subjectName" | "profileName">,
>(things: readonly T[]): string {
  if (things.length === 0) return "";
  if (things.length > 2) return `${countWord(things.length)} entregas`;
  return joinWords(things.map((thing) => `${describeThing(thing)} de ${thing.profileName}`));
}

/** "2 provas" ou "3 coisas": o dia cheio contado, no atalho da noite para a semana. */
export function fullDayCount(things: ReadonlyArray<Pick<Thing, "type">>): string {
  const types = new Set(things.map((thing) => thing.type));
  const [first] = things;
  if (things.length === 1 && first) return `1 ${SINGULAR[first.type] ?? "coisa"}`;
  return `${things.length} ${types.size === 1 ? (PLURAL[first?.type ?? ""] ?? "coisas") : "coisas"}`;
}

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
