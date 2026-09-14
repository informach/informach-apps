import { Badge } from "@informach/ui/components/badge";
import { findActivityHistory } from "@/features/activities/history-repository";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import { ActivityDetailShell } from "@/features/unified-activities/components/detail-shell";
import { ActivityRevisionList } from "@/features/unified-activities/components/revision-list";
import { toActivityView } from "@/features/unified-activities/view";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "../types";
import { formatTurmaShort } from "../utils";
import { SchoolActivityManage } from "./school-activity-manage";

/**
 * Detalhe de uma atividade de turma.
 *
 * Antes não existia: o card abria um diálogo, e `/atividades/[id]/historico`
 * mostrava só o histórico, sem os campos nem edição. Agora é a mesma página das
 * outras fontes, com o histórico como seção.
 *
 * `rows` traz uma linha por criança acessível — a mesma atividade pode valer
 * para dois filhos, e cada um tem a sua conclusão.
 */
export async function SchoolActivityDetail({
  currentUserId,
  rows,
  isPro,
  turmas,
}: {
  currentUserId: string;
  rows: ActivityListItem[];
  isPro: boolean;
  turmas: TurmaWithSubjectsForForm[];
}) {
  const first = rows[0];
  if (!first) return null;
  const view = toActivityView(
    { source: "turma", key: `turma:${first.statusId}`, item: first },
    currentUserId,
  );
  const found = await findActivityHistory(currentUserId, first.activityId);

  return (
    <ActivityDetailShell
      profileName={rows.map((row) => row.studentProfileName).join(", ")}
      title={first.title}
      meta={view.version && view.version > 1 ? `versão ${view.version}` : undefined}
    >
      <section className="space-y-3 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ACTIVITY_TYPE_LABELS[first.type]}</Badge>
          {first.visibility === "shared_with_turma" ? (
            <Badge variant="outline" className="font-normal">
              Compartilhada
            </Badge>
          ) : null}
          {first.canceledAt ? <Badge variant="destructive">Cancelada pelo criador</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {first.subjectName} · {formatTurmaShort(first.grade, first.classLetter, first.year)} ·{" "}
          {first.schoolName}
        </p>
        <p className="text-sm">Entrega em {first.dueAt.split("-").reverse().join("/")}</p>
        {first.description ? (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
            {first.description}
          </p>
        ) : null}
        <SchoolActivityManage
          item={first}
          isPro={isPro}
          turmas={turmas}
          canManage={view.manage !== null}
        />
      </section>
      <ActivityRevisionList
        revisions={(found?.history ?? []).map((row) => ({
          version: row.revision.version,
          actor: row.name,
          createdAt: row.revision.createdAt,
          previous: row.revision.previous as Record<string, unknown>,
          current: row.revision.current as Record<string, unknown>,
        }))}
      />
    </ActivityDetailShell>
  );
}
