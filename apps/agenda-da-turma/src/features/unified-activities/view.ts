import {
  canEditActivity,
  getDueBadgeLabel,
  getDueBadgeVariant,
  getDueUrgency,
} from "@/features/activities/utils";
import { DATE_ORIGIN_LABELS, SOURCE_LABELS } from "@/features/notices/schemas";
import type { ActivityType } from "./activity-types";
import type { ActivityOverviewItem } from "./overview-types";

/**
 * O que qualquer lista precisa saber sobre uma atividade, seja qual for a
 * tabela em que ela mora.
 *
 * As três fontes têm formatos diferentes — a de recado vem aninhada sob
 * `.action`, a extracurricular chama a matéria de `profileSubjectName`, e só
 * a de recado admite prazo nulo e situação `canceled`. Enquanto cada card lia
 * a sua própria forma, a família via três comportamentos diferentes para a
 * mesma coisa: um card abria página, outro abria diálogo, o terceiro não abria
 * nada; um mostrava prazo em badge, outro em texto.
 *
 * `toActivityView` é o único lugar que conhece as três formas. Tudo depois
 * dele lê um formato só. A Fase 4 encolhe este adaptador quando as tabelas
 * convergirem, sem mexer em quem consome.
 */
export type ActivityViewStatus = "pending" | "done" | "canceled";

/** O que o card precisa para alternar a conclusão em cada fonte. */
export type ActivityToggleTarget =
  | { kind: "turma"; activityId: string; studentProfileId: string }
  | { kind: "notice"; id: string; version: number }
  | { kind: "extra"; id: string };

export type ActivityView = {
  /** Estável por (atividade × criança) — o mesmo `key` da projeção. */
  key: string;
  source: ActivityOverviewItem["source"];
  /** Linha que o detalhe abre. */
  id: string;
  title: string;
  description: string | null;
  type: ActivityType;
  status: ActivityViewStatus;
  profileId: string;
  profileName: string;
  /** Nulo só nas atividades vindas de recado: prazo a confirmar é um dado. */
  dueAt: string | null;
  time: string | null;
  location: string | null;
  subjectName: string | null;
  subjectColorIndex: number | null;
  /** Segunda linha de contexto: turma e ano, ou "extracurricular". */
  contextLine: string | null;
  /** Procedência do prazo e origem do recado, quando a fonte as tem. */
  provenance: string | null;
  /** Quem ficou de cuidar. */
  assignment: string | null;
  shared: boolean;
  version: number | null;
  detailHref: string;
  /** Ausente quando a atividade está cancelada: não se alterna o que foi cancelado. */
  toggle: ActivityToggleTarget | null;
  /** Presente só para quem pode editar pelo próprio card. */
  manage: { activityId: string } | null;
};

function noticeProvenance(
  source: keyof typeof SOURCE_LABELS | null,
  dateOrigin: keyof typeof DATE_ORIGIN_LABELS,
): string {
  const origin = source ? SOURCE_LABELS[source] : "Planejamento da família";
  // Com origem conhecida a procedência do prazo sempre informa; sem ela, só
  // quando diz algo além do óbvio "planejado pela família".
  return source || dateOrigin !== "family"
    ? `${origin} · ${DATE_ORIGIN_LABELS[dateOrigin]}`
    : origin;
}

function formatTurmaContext(grade: string, classLetter: string, year: number): string {
  const gradeNumber = grade.replace(/[^0-9]/g, "");
  return `${gradeNumber}º ano ${classLetter} · ${year}`;
}

export function toActivityView(entry: ActivityOverviewItem, currentUserId: string): ActivityView {
  if (entry.source === "notice") {
    const { action } = entry.item;
    const canceled = action.status === "canceled";
    return {
      key: entry.key,
      source: "notice",
      id: action.id,
      title: action.title,
      description: action.description,
      type: action.type,
      status: action.status,
      profileId: action.profileId,
      profileName: entry.item.profileName,
      dueAt: action.dueAt,
      time: action.time,
      location: action.location,
      subjectName: entry.item.subjectName,
      subjectColorIndex: entry.item.subjectColorIndex,
      contextLine: null,
      provenance: noticeProvenance(entry.item.source, action.dateOrigin),
      assignment: entry.item.assignedName
        ? `Acompanhamento: ${entry.item.assignedName}`
        : "Combine o acompanhamento em família",
      shared: false,
      version: action.version,
      detailHref: `/atividades/${action.id}`,
      toggle: canceled ? null : { kind: "notice", id: action.id, version: action.version },
      // Edição de atividade vinda de recado acontece na página de detalhe,
      // onde o histórico e a fonte estão à vista.
      manage: null,
    };
  }

  if (entry.source === "extra") {
    const item = entry.item;
    return {
      key: entry.key,
      source: "extra",
      id: item.activityId,
      title: item.title,
      description: item.description,
      type: item.type,
      status: item.status,
      profileId: item.studentProfileId,
      profileName: item.studentProfileName,
      dueAt: item.dueAt,
      time: null,
      location: null,
      subjectName: item.profileSubjectName,
      subjectColorIndex: item.profileSubjectColorIndex,
      contextLine: "extracurricular",
      provenance: null,
      assignment: null,
      shared: false,
      version: null,
      detailHref: `/atividades/${item.activityId}`,
      toggle: { kind: "extra", id: item.activityId },
      manage: null,
    };
  }

  const item = entry.item;
  return {
    key: entry.key,
    source: "turma",
    id: item.activityId,
    title: item.title,
    description: item.description,
    type: item.type,
    status: item.canceledAt ? "canceled" : item.status,
    profileId: item.studentProfileId,
    profileName: item.studentProfileName,
    dueAt: item.dueAt,
    time: null,
    location: null,
    subjectName: item.subjectName,
    subjectColorIndex: item.subjectColorIndex,
    contextLine: formatTurmaContext(item.grade, item.classLetter, item.year),
    provenance: null,
    assignment: null,
    shared: item.visibility === "shared_with_turma",
    version: item.version ?? null,
    detailHref: `/atividades/${item.activityId}`,
    toggle: item.canceledAt
      ? null
      : { kind: "turma", activityId: item.activityId, studentProfileId: item.studentProfileId },
    manage: canEditActivity(item, currentUserId) ? { activityId: item.activityId } : null,
  };
}

/**
 * Prazo em badge para qualquer fonte.
 *
 * Os helpers de urgência exigem data e por isso o card de recado nunca pôde
 * usá-los: mostrava o prazo como texto solto enquanto os outros dois mostravam
 * badge colorido. Aqui a ausência de prazo vira um estado legítimo — é
 * informação, não falha — e a hora entra no mesmo rótulo quando existe.
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
