import { addDaysIso, parseLocalIso } from "@/features/dashboard/date";
import {
  dayMonthLabel,
  daysBetweenIso,
  formatClockTime,
  shortDayLabel,
  weekdayLong,
  weekRangeLabel,
} from "@/features/dashboard/day-labels";
import { fullDayDetail } from "@/features/dashboard/page-of-day";
import { countWord, describeThing } from "@/features/dashboard/routine-summary";
import { formatEstimateLong } from "@/features/unified-activities/estimate";
import { fullDayPhrase, type WeeklyItem, weeklyLoad } from "./weekly";

/**
 * O e-mail de domingo, como na prancha "Resumo da semana" do canvas: o título
 * com a semana, o dia cheio e quando dá para adiantar, o que ficou para trás,
 * um dia por linha (com a mochila de cada um), o que está sem data e o botão
 * para a semana na Agenda.
 *
 * Puro: monta e desenha sem banco, sem relógio e sem provedor. O HTML é de
 * e-mail (tabelas e estilo na linha), e as cores são as da paleta do app
 * escritas por extenso, porque cliente de e-mail não lê variável de CSS.
 */

export type WeeklyEmailItem = Omit<WeeklyItem, "subjectName"> & {
  subjectName: string | null;
  subjectColorIndex: number | null;
  time: string | null;
  location: string | null;
};

/** A mochila de um dia: "Na mochila de Miguel: touca, óculos e toalha de natação". */
export type WeeklyBackpack = { profileName: string; items: string[]; onlyFrom: string | null };

export type WeeklyEmail = {
  subject: string;
  /** O texto que a caixa de entrada mostra depois do assunto. */
  preheader: string;
  heading: string;
  full: { lead: string; text: string } | null;
  late: string | null;
  days: Array<{
    iso: string;
    label: string;
    full: boolean;
    lines: Array<{ text: string; color: string | null }>;
    backpack: string[];
  }>;
  undated: string[];
  /** "Você recebe este resumo aos domingos, às 18h." */
  schedule: string;
};

/** As cores das matérias, como no app (`--chart-1` a `--chart-5`). */
const SUBJECT_HEX: Record<number, string> = {
  1: "#3B82F6",
  2: "#10B981",
  3: "#8B5CF6",
  4: "#F97316",
  5: "#EC4899",
};
const INK = {
  text: "#0D0D0D",
  muted: "#555555",
  line: "#D9D9D9",
  ground: "#EDEDED",
  sheet: "#FAFAFA",
  primary: "#006FFD",
  orange: "#A6480C",
  orangeTint: "#FAEFE8",
  red: "#A83232",
  redTint: "#F9EAEA",
};

const PLURAL_DAYS: Record<number, string> = {
  0: "aos domingos",
  1: "às segundas",
  2: "às terças",
  3: "às quartas",
  4: "às quintas",
  5: "às sextas",
  6: "aos sábados",
};

const PLURAL_TYPES: Record<string, string> = {
  task: "tarefas",
  exam: "provas",
  project: "trabalhos",
  reminder: "lembretes",
  material: "materiais",
  authorization: "autorizações",
  event: "eventos",
  study: "sessões de estudo",
};

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Páginas 32 e 33 do livro" vira "páginas 32 e 33 do livro" no meio da frase. */
function inSentence(title: string, names: readonly string[]) {
  const first = title.split(/\s+/)[0] ?? "";
  if (names.includes(first) || first === first.toUpperCase()) return title;
  return title.charAt(0).toLowerCase() + title.slice(1);
}

/** "na quinta", "no sábado". */
function onDay(iso: string) {
  const weekday = weekdayLong(iso).toLowerCase();
  return `${weekday === "sábado" || weekday === "domingo" ? "no" : "na"} ${weekday}`;
}

function joinWith(words: readonly string[], last: string) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${last} ${words[words.length - 1]}`;
}

function itemText(item: WeeklyEmailItem, names: readonly string[]) {
  const head = item.subjectName ? `${item.profileName} · ${item.subjectName}` : item.profileName;
  const extras = [
    item.time ? `às ${formatClockTime(item.time)}` : null,
    item.location,
    item.estimatedMinutes ? `cerca de ${formatEstimateLong(item.estimatedMinutes)}` : null,
  ].filter(Boolean);
  return `${head}: ${inSentence(item.title, names)}${extras.length ? `, ${extras.join(", ")}` : ""}`;
}

/** "sexta, 16" perto de hoje; "2 de outubro" quando já faz mais de uma semana. */
function wasDue(iso: string, todayIso: string) {
  return daysBetweenIso(iso, todayIso) < 7
    ? `${weekdayLong(iso).toLowerCase()}, ${Number(iso.slice(8))}`
    : dayMonthLabel(iso, todayIso);
}

export function buildWeeklyEmail(input: {
  todayIso: string;
  /** O que está em aberto, das crianças da casa Pro: atrasadas, da semana e sem data. */
  items: readonly WeeklyEmailItem[];
  /** A mochila de cada dia da semana, por criança. */
  backpacks: Readonly<Record<string, readonly WeeklyBackpack[]>>;
  subject: string;
  digestDay: number;
  digestHour: number;
}): WeeklyEmail {
  const { todayIso } = input;
  const open = input.items.filter((item) => item.status !== "done" && item.status !== "canceled");
  const names = [...new Set(open.map((item) => item.profileName))];
  const { fromIso, startIso, toIso, window } = weeklyLoad(open, todayIso);
  const inWeek = open.filter((item) => item.dueAt && item.dueAt >= startIso && item.dueAt <= toIso);

  // O dia cheio e, antes dele, os dois dias mais livres para começar a estudar.
  const firstFull = window.find((day) => day.level === "cheio");
  let full: WeeklyEmail["full"] = null;
  if (firstFull) {
    const things = inWeek.filter((item) => item.dueAt === firstFull.iso);
    const studyable = things.some((item) => item.type === "exam" || item.type === "project");
    const before = window
      // Estudar é sugerido nos dias da semana de aula, como o título.
      .filter((day) => day.iso < firstFull.iso && day.iso >= fromIso)
      .sort((a, b) => a.deliveries + a.study - (b.deliveries + b.study) || (a.iso < b.iso ? -1 : 1))
      .slice(0, 2)
      .sort((a, b) => (a.iso < b.iso ? -1 : 1));
    const detail = fullDayDetail(things);
    full = {
      lead: `${capitalize(fullDayPhrase(firstFull.iso, todayIso))}:`,
      text: `${detail}.${
        studyable && before.length
          ? ` Se der, comece a estudar ${joinWith(
              before.map((day) => onDay(day.iso)),
              "ou",
            )}.`
          : ""
      }`,
    };
  }

  const lateItems = open
    .filter((item) => item.dueAt && item.dueAt < todayIso)
    .sort((a, b) => ((a.dueAt ?? "") < (b.dueAt ?? "") ? -1 : 1));
  const oldest = lateItems[0];
  const late = !oldest
    ? null
    : lateItems.length === 1
      ? `${inSentence(oldest.title, names)} de ${oldest.profileName}, que era até ${wasDue(oldest.dueAt as string, todayIso)}.`
      : `${countWord(lateItems.length)} atividades, a mais antiga de ${wasDue(oldest.dueAt as string, todayIso)}.`;

  const days: WeeklyEmail["days"] = [];
  for (let iso = startIso; iso <= toIso; iso = addDaysIso(iso, 1)) {
    const ofDay = inWeek
      .filter((item) => item.dueAt === iso)
      .sort(
        (a, b) =>
          a.profileName.localeCompare(b.profileName, "pt-BR") ||
          (a.time ?? "99:99").localeCompare(b.time ?? "99:99"),
      );
    const backpack = (input.backpacks[iso] ?? [])
      .filter((child) => child.items.length)
      .map(
        (child) =>
          `Na mochila de ${child.profileName}: ${joinWith(child.items, "e")}${child.onlyFrom ? ` de ${child.onlyFrom}` : ""}`,
      );
    if (!ofDay.length && !backpack.length) continue;
    days.push({
      iso,
      label: shortDayLabel(iso, todayIso),
      full: window.find((day) => day.iso === iso)?.level === "cheio",
      lines: ofDay.map((item) => ({
        text: itemText(item, names),
        color:
          item.subjectColorIndex !== null ? (SUBJECT_HEX[item.subjectColorIndex] ?? null) : null,
      })),
      backpack,
    });
  }

  // O que a caixa de entrada mostra: o dia cheio primeiro, depois a semana na ordem.
  const phrases = window
    .filter((day) => inWeek.some((item) => item.dueAt === day.iso))
    .sort(
      (a, b) =>
        Number(b.level === "cheio") - Number(a.level === "cheio") || (a.iso < b.iso ? -1 : 1),
    )
    .slice(0, 3)
    .map((day) => {
      const things = inWeek.filter((item) => item.dueAt === day.iso);
      const types = new Set(things.map((item) => item.type));
      const [only] = things;
      const what =
        things.length === 1 && only
          ? describeThing(only)
          : `${things.length} ${types.size === 1 ? (PLURAL_TYPES[only?.type ?? ""] ?? "coisas") : "coisas"}`;
      return `${what} ${onDay(day.iso)}`;
    });

  const weekday = parseLocalIso(todayIso).getDay();
  return {
    subject: input.subject,
    preheader: phrases.length ? `${capitalize(joinWith(phrases, "e"))}.` : "",
    heading: `A semana de ${weekRangeLabel(fromIso, toIso)}`,
    full,
    late,
    days,
    undated: open
      .filter((item) => !item.dueAt)
      .map((item) => `${item.profileName}: ${inSentence(item.title, names)}`),
    schedule: `Você recebe este resumo ${PLURAL_DAYS[input.digestDay] ?? PLURAL_DAYS[weekday]}, às ${input.digestHour}h.`,
  };
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

export type WeeklyEmailLinks = {
  /** "Abrir a semana na Agenda". */
  weekUrl: string;
  /** "Mudar dia e hora": as preferências dos resumos. */
  settingsUrl: string;
  unsubscribeUrl: string;
  /** O símbolo da Agenda, em endereço absoluto: e-mail não carrega SVG. */
  logoUrl: string;
  footnote: string;
};

/** O HTML do e-mail, em tabelas e com o estilo na linha, para os clientes de e-mail. */
export function renderWeeklyEmailHtml(email: WeeklyEmail, links: WeeklyEmailLinks): string {
  const font = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
  const dot = (color: string) =>
    `<span style="display:inline-block;width:8px;height:8px;border-radius:8px;background:${color};margin-right:6px;vertical-align:1px"></span>`;
  const cell = `border-top:1px solid ${INK.line};padding:16px 0;vertical-align:top`;
  const rows = [
    ...email.days.map((day) => {
      const tint = day.full ? `background:${INK.orangeTint};` : "";
      const pad = day.full ? "padding-left:14px;padding-right:14px;" : "";
      const lines = [
        ...day.lines.map(
          (line) =>
            `<div style="margin:0 0 6px">${line.color ? dot(line.color) : ""}${escapeHtml(line.text)}</div>`,
        ),
        ...day.backpack.map(
          (text) => `<div style="margin:0 0 6px;color:${INK.muted}">${escapeHtml(text)}</div>`,
        ),
      ].join("");
      return `<tr style="${tint}"><td width="96" style="${cell};${pad}font-size:15px;font-weight:800;color:${day.full ? INK.orange : INK.text}">${escapeHtml(day.label)}</td><td style="${cell};${pad}font-size:15px;line-height:1.45">${lines}</td></tr>`;
    }),
    ...(email.undated.length
      ? [
          `<tr><td width="96" style="${cell};font-size:15px;font-weight:800;color:${INK.muted}">sem data</td><td style="${cell};font-size:15px;line-height:1.45">${email.undated.map((text) => `<div style="margin:0 0 6px">${escapeHtml(text)}</div>`).join("")}</td></tr>`,
        ]
      : []),
  ].join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(email.subject)}</title></head><body style="margin:0;padding:0;background:${INK.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(email.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK.ground};font-family:${font};color:${INK.text}"><tr><td align="center" style="padding:20px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="background:${INK.sheet};border-radius:18px;padding:28px 32px">
<div style="font-size:14px;font-weight:700"><img src="${escapeHtml(links.logoUrl)}" width="22" height="22" alt="" style="vertical-align:middle;border:0;border-radius:5px;margin-right:8px">agenda da turma</div>
<h1 style="margin:20px 0 0;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-0.03em">${escapeHtml(email.heading)}</h1>
${email.full ? `<p style="margin:12px 0 10px;font-size:16px;line-height:1.55;color:#2B2B2B"><b style="color:${INK.orange}">${escapeHtml(email.full.lead)}</b> ${escapeHtml(email.full.text)}</p>` : ""}
${email.late ? `<div style="margin:10px 0 12px;padding:12px 14px;border-radius:12px;background:${INK.redTint};font-size:15px;line-height:1.45"><b style="color:${INK.red}">Ficou para trás:</b> ${escapeHtml(email.late)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${rows}</table>
<a href="${escapeHtml(links.weekUrl)}" style="display:inline-block;margin-top:20px;padding:14px 22px;border-radius:12px;background:${INK.primary};color:#FFFFFF;font-weight:800;font-size:16px;text-decoration:none">Abrir a semana na Agenda</a>
</td></tr>
<tr><td style="padding:14px 8px 0;font-size:13px;line-height:1.55;color:${INK.muted}">${escapeHtml(email.schedule)} <a href="${escapeHtml(links.settingsUrl)}" style="color:${INK.muted};font-weight:700">Mudar dia e hora</a> · <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:${INK.muted};font-weight:700">Não quero mais receber</a>. ${escapeHtml(links.footnote)}</td></tr>
</table></td></tr></table></body></html>`;
}

/** A versão em texto do mesmo e-mail, para quem lê sem HTML. */
export function renderWeeklyEmailText(email: WeeklyEmail, links: WeeklyEmailLinks): string {
  const parts = [
    email.heading,
    email.full ? `${email.full.lead} ${email.full.text}` : null,
    email.late ? `Ficou para trás: ${email.late}` : null,
    ...email.days.map((day) =>
      [
        `${day.label}:`,
        ...day.lines.map((line) => `  ${line.text}`),
        ...day.backpack.map((text) => `  ${text}`),
      ].join("\n"),
    ),
    email.undated.length
      ? ["sem data:", ...email.undated.map((text) => `  ${text}`)].join("\n")
      : null,
    `Abrir a semana na Agenda: ${links.weekUrl}`,
    `${email.schedule} Mudar dia e hora: ${links.settingsUrl}`,
    `${links.footnote}\nNão quero mais receber: ${links.unsubscribeUrl}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}
