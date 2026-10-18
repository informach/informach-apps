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
  /** Duração estimada pela família, em minutos. Nulo é o normal. */
  estimatedMinutes: number | null;
  location: string | null;
  subjectName: string | null;
  subjectColorIndex: number | null;
  /** Segunda linha de contexto: turma e ano, ou "fora da escola". */
  contextLine: string | null;
  /** Procedência do prazo e origem do recado, quando dizem algo. */
  provenance: string | null;
  /** Quem ficou de cuidar, quando alguém ficou. */
  assignedName: string | null;
  shared: boolean;
  isExtra: boolean;
  version: number;
  /** O conteúdo foi editado depois de salvo (concluir e reabrir não contam). */
  editedAfterSave: boolean;
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
      ? "fora da escola"
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
    estimatedMinutes: item.estimatedMinutes,
    location: item.location,
    subjectName: item.subjectName,
    subjectColorIndex: item.subjectColorIndex,
    contextLine,
    provenance,
    // Só quando alguém ficou de cuidar. O convite a combinar mora no detalhe,
    // e não repetido em cada linha de quem cuida sozinha.
    assignedName: item.assignedName,
    shared: item.visibility === "shared_with_turma",
    isExtra: item.profileSubjectId !== null,
    version: item.version,
    editedAfterSave: item.editedAfterSave,
    detailHref: `/atividades/${item.id}`,
    toggle: canceled ? null : { id: item.id, version: item.version },
    sharedActivityId: item.sharedActivityId,
    manage: !canceled && item.createdByUserId === currentUserId ? { id: item.id } : null,
  };
}
