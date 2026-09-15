import { getDueBadgeLabel, getDueBadgeVariant, getDueUrgency } from "@/features/activities/utils";
import { DATE_ORIGIN_LABELS, SOURCE_LABELS } from "@/features/notices/schemas";
import type { ActivityType } from "./activity-types";
import type { ActivityOverviewItem } from "./overview-types";

/**
 * O que qualquer lista precisa saber sobre uma atividade.
 *
 * Este adaptador já traduziu três formatos diferentes, um por tabela. Com a
 * convergência ele traduz um só, e o que variava entre as fontes virou campo
 * opcional: turma quando a atividade foi publicada numa, matéria quando há
 * vínculo, origem quando veio de um recado. Sobrou a tradução de vocabulário
 * entre o banco e a tela, que é o trabalho legítimo de um adaptador.
 */
export type ActivityViewStatus = "pending" | "done" | "canceled";

export type ActivityView = {
  key: string;
  /** Linha que o detalhe abre. */
  id: string;
  title: string;
  description: string | null;
  type: ActivityType;
  status: ActivityViewStatus;
  profileId: string;
  profileName: string;
  /** Nulo é um estado legítimo: prazo a confirmar é informação, não falta. */
  dueAt: string | null;
  time: string | null;
  location: string | null;
  subjectName: string | null;
  subjectColorIndex: number | null;
  /** Segunda linha de contexto: turma e ano, ou "extracurricular". */
  contextLine: string | null;
  /** Procedência do prazo e origem do recado, quando dizem algo. */
  provenance: string | null;
  /** Quem ficou de cuidar, quando alguém ficou. */
  assignment: string | null;
  shared: boolean;
  isExtra: boolean;
  version: number;
  detailHref: string;
  /** Ausente quando cancelada: não se alterna o que foi cancelado. */
  toggle: { id: string; version: number } | null;
  /** A atividade de turma que esta tarefa executa, quando há uma. */
  sharedActivityId: string | null;
  /** Presente só para quem pode editar pelo próprio card. */
  manage: { id: string } | null;
};

function formatTurmaContext(grade: string, classLetter: string, year: number): string {
  const gradeNumber = grade.replace(/[^0-9]/g, "");
  return `${gradeNumber}º ano ${classLetter} · ${year}`;
}

export function toActivityView(entry: ActivityOverviewItem, currentUserId: string): ActivityView {
  const item = entry.item;
  const canceled = item.status === "canceled";

  const contextLine = item.sharedActivityId
    ? item.grade && item.classLetter && item.year
      ? formatTurmaContext(item.grade, item.classLetter, item.year)
      : null
    : item.profileSubjectId
      ? "extracurricular"
      : null;

  // Procedência só aparece quando informa. Dizer "planejado pela família" numa
  // atividade que a própria pessoa acabou de escrever é ruído.
  const origin = item.noticeSource ? SOURCE_LABELS[item.noticeSource] : null;
  const dateOrigin =
    item.dateOrigin === "family" || item.dateOrigin === "unspecified"
      ? null
      : DATE_ORIGIN_LABELS[item.dateOrigin];
  const provenance = [origin, dateOrigin].filter(Boolean).join(" · ") || null;

  return {
    key: entry.key,
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.status,
    profileId: item.profileId,
    profileName: item.profileName,
    dueAt: item.dueAt,
    time: item.time,
    location: item.location,
    subjectName: item.subjectName,
    subjectColorIndex: item.subjectColorIndex,
    contextLine,
    provenance,
    // Só quando alguém ficou de cuidar. O convite a combinar mora no detalhe,
    // e não repetido em cada card de quem cuida sozinha.
    assignment: item.assignedName ? `Acompanhamento: ${item.assignedName}` : null,
    shared: item.visibility === "shared_with_turma",
    isExtra: item.profileSubjectId !== null,
    version: item.version,
    detailHref: `/atividades/${item.id}`,
    toggle: canceled ? null : { id: item.id, version: item.version },
    sharedActivityId: item.sharedActivityId,
    manage: !canceled && item.createdByUserId === currentUserId ? { id: item.id } : null,
  };
}

/**
 * Prazo em badge para qualquer atividade.
 *
 * Os helpers de urgência exigem data, e por isso a atividade vinda de recado
 * nunca pôde usá-los: mostrava o prazo como texto solto enquanto as outras
 * mostravam badge colorido. Aqui a ausência de prazo é um estado legítimo, e a
 * hora entra no mesmo rótulo quando existe.
 */
export function getViewDueBadge(
  view: ActivityView,
  now = new Date(),
): { label: string; variant: "destructive" | "warning" | "default" | "muted" } {
  if (view.status === "canceled") return { label: "Cancelada", variant: "muted" };
  if (!view.dueAt) return { label: "Prazo a confirmar", variant: "muted" };
  const urgency = getDueUrgency(view.dueAt, view.status === "done" ? "done" : "pending", now);
  const label = getDueBadgeLabel(view.dueAt, urgency, now);
  return {
    label: view.time ? `${label} às ${view.time}` : label,
    variant: getDueBadgeVariant(urgency),
  };
}
