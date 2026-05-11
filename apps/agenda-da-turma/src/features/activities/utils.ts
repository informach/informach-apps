import { Bell, CheckSquare, ClipboardCheck, FolderKanban, type LucideIcon } from "lucide-react";
import type { ActivityStatusValue, ActivityType } from "./types";

const TYPE_LABEL: Record<ActivityType, string> = {
  task: "Tarefa",
  exam: "Prova",
  project: "Trabalho",
  reminder: "Lembrete",
};

const TYPE_ICON: Record<ActivityType, LucideIcon> = {
  task: CheckSquare,
  exam: ClipboardCheck,
  project: FolderKanban,
  reminder: Bell,
};

const STATUS_LABEL: Record<ActivityStatusValue, string> = {
  pending: "Pendente",
  done: "Concluído",
};

export function getActivityTypeLabel(type: ActivityType): string {
  return TYPE_LABEL[type];
}

export function getActivityTypeIcon(type: ActivityType): LucideIcon {
  return TYPE_ICON[type];
}

export function getActivityStatusLabel(status: ActivityStatusValue): string {
  return STATUS_LABEL[status];
}

// Local date no formato YYYY-MM-DD (sem TZ). Usar pra comparar com dueAt.
function todayLocalIso(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function tomorrowLocalIso(now: Date): string {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return todayLocalIso(t);
}

// Categoria de urgência da data de entrega:
// - overdue: passou a data, ainda não concluído
// - due_soon: entrega é hoje ou amanhã
// - upcoming: entrega é depois de amanhã pra frente
// - done: atividade concluída (não importa a data, não é "urgente")
export type DueUrgency = "overdue" | "due_soon" | "upcoming" | "done";

export function getDueUrgency(
  dueAt: string,
  status: ActivityStatusValue,
  now = new Date(),
): DueUrgency {
  if (status === "done") return "done";
  const today = todayLocalIso(now);
  if (dueAt < today) return "overdue";
  if (dueAt === today || dueAt === tomorrowLocalIso(now)) return "due_soon";
  return "upcoming";
}

// Variant do Badge que comunica a urgência:
// - overdue → destructive (vermelho, atenção urgente)
// - due_soon → warning (âmbar, ta na hora)
// - upcoming → default (azul/primário no agenda, "tá tudo bem")
// - done → muted (cinza sólido, mesma forma de badge mas de-emphasized)
const URGENCY_BADGE_VARIANT: Record<DueUrgency, "destructive" | "warning" | "default" | "muted"> = {
  overdue: "destructive",
  due_soon: "warning",
  upcoming: "default",
  done: "muted",
};

export function getDueBadgeVariant(
  urgency: DueUrgency,
): "destructive" | "warning" | "default" | "muted" {
  return URGENCY_BADGE_VARIANT[urgency];
}

// "YYYY-MM-DD" → "DD/MM" se ano corrente, "DD/MM/AAAA" caso contrário.
// Esconde o ano quando óbvio (atividades quase sempre são do ano atual);
// mostra explícito quando atravessa anos pra evitar ambiguidade.
function formatBadgeDate(dueAt: string, now: Date): string {
  const [year, month, day] = dueAt.split("-");
  if (!year || !month || !day) return dueAt;
  if (year === String(now.getFullYear())) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

// Rótulo do badge de urgência:
// - overdue: "Atrasada · DD/MM"
// - due_soon hoje: "Hoje · DD/MM"
// - due_soon amanhã: "Amanhã · DD/MM"
// - upcoming/done: "DD/MM" (ano só se diferente do atual)
export function getDueBadgeLabel(dueAt: string, urgency: DueUrgency, now = new Date()): string {
  const short = formatBadgeDate(dueAt, now);
  if (urgency === "overdue") return `Atrasada · ${short}`;
  if (urgency === "due_soon") {
    return dueAt === todayLocalIso(now) ? `Hoje · ${short}` : `Amanhã · ${short}`;
  }
  return short;
}

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// "YYYY-MM-DD" → "DD/MM/AAAA". Mantido pra exibições onde queremos data
// completa sempre (atualmente sem uso ativo na UI — o badge de urgência
// substituiu a maior parte dos casos).
export function formatActivityDueAt(dueAt: string): string {
  // Interpreta como meio-dia UTC pra evitar shift de TZ que jogaria a data
  // pro dia anterior em fusos negativos.
  const date = new Date(`${dueAt}T12:00:00Z`);
  return FULL_DATE_FORMATTER.format(date);
}

// Formata "5º ano A · 2025" pra exibição compacta.
export function formatTurmaShort(grade: string, classLetter: string, year: number): string {
  // grade é "1ano".."9ano" no schema; extrai o número.
  const gradeNumber = grade.replace(/[^0-9]/g, "");
  return `${gradeNumber}º ano ${classLetter} · ${year}`;
}
