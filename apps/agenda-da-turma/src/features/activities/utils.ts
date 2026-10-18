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
