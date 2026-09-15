import type { LucideIcon } from "lucide-react";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { getActivityPresentation } from "@/features/unified-activities/presentation";
import type { ActivityStatusValue, ActivityType } from "./types";

const STATUS_LABEL: Record<ActivityStatusValue, string> = {
  pending: "Pendente",
  done: "Concluído",
};

// Rótulo e ícone vêm da apresentação única em `unified-activities` — antes
// havia um mapa próprio aqui, o que fazia o mesmo tipo aparecer com ícone e
// nome diferentes no card escolar e no card da rotina.
export function getActivityTypeLabel(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type];
}

export function getActivityTypeIcon(type: ActivityType): LucideIcon {
  return getActivityPresentation(type).icon;
}

export function getActivityStatusLabel(status: ActivityStatusValue): string {
  return STATUS_LABEL[status];
}

// "Hoje" e "amanhã" vêm de `features/dashboard/date`, que fixa o fuso em
// `America/Sao_Paulo`.
//
// Havia aqui uma cópia privada de `todayLocalIso` que lia `getFullYear`,
// `getMonth` e `getDate` — ou seja, o fuso do PROCESSO. Como as funções abaixo
// têm `now = new Date()` por padrão e são chamadas durante a renderização no
// servidor, o Railway (UTC) passava a achar que hoje já era amanhã a partir das
// 21h de Brasília: o prazo de hoje deixava de dizer "Hoje", o de amanhã passava
// a dizer "Hoje", e o vencido no próprio dia aparecia atrasado. Sobrava ainda a
// divergência de hidratação entre o HTML do servidor e o navegador da família.
//
// `features/dashboard/date` documenta esse perigo e é a fonte única desse
// cálculo. Não reintroduzir uma cópia local: foi exatamente ela que derivou.
function tomorrowLocalIso(now: Date): string {
  return addDaysIso(todayLocalIso(now), 1);
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
  // Ano corrente em São Paulo, pelo mesmo caminho do resto: em 31/12 às 22h
  // BRT o servidor em UTC já está no ano seguinte e passaria a carimbar o ano
  // em toda data.
  if (year === todayLocalIso(now).slice(0, 4)) return `${day}/${month}`;
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

// Gate de edit/delete pelo creator. Bloqueia mesmo o criador quando a atividade
// foi compartilhada e outra família já aceitou — evita apagar/mudar atividade
// que outra família já considera certa pra rotina dela. Service replica a
// regra; UI só esconde o botão. Reutilizado em ActivityCard e ActivityDetailDialog.
