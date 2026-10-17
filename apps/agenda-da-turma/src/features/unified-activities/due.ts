import { todayLocalIso } from "@/features/dashboard/date";
import { dayDistance, formatClockTime, shortDayLabel } from "@/features/dashboard/day-labels";

/**
 * O "quando" de uma atividade numa lista: o chip à direita de cada linha.
 *
 * Substitui o badge de urgência, que pintava a data de quatro cores (vermelho,
 * âmbar, azul, cinza) e escrevia "22/10". A cor passou a ser da matéria; o
 * estado se diz com palavra e peso: "Passou · sex, 16" tingido de vermelho,
 * "Hoje" preenchido, "Amanhã" contornado, "qua, 21 · 8h" discreto e "Sem
 * data" no mesmo lugar, para nenhuma linha ficar sem resposta.
 */
export type DueTone = "late" | "today" | "tomorrow" | "later" | "none" | "done" | "canceled";

export type DueLabel = { label: string; tone: DueTone };

export function describeDue(
  activity: { dueAt: string | null; time: string | null; status: "pending" | "done" | "canceled" },
  todayIso: string = todayLocalIso(),
): DueLabel {
  if (activity.status === "canceled") return { label: "Cancelada", tone: "canceled" };
  if (activity.status === "done") return { label: "Feito", tone: "done" };
  if (!activity.dueAt) return { label: "Sem data", tone: "none" };
  const time = activity.time ? ` · ${formatClockTime(activity.time)}` : "";
  switch (dayDistance(activity.dueAt, todayIso)) {
    case "late":
      return { label: `Passou · ${shortDayLabel(activity.dueAt, todayIso)}`, tone: "late" };
    case "today":
      return { label: `Hoje${time}`, tone: "today" };
    case "tomorrow":
      return { label: `Amanhã${time}`, tone: "tomorrow" };
    default:
      return { label: `${shortDayLabel(activity.dueAt, todayIso)}${time}`, tone: "later" };
  }
}
