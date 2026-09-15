import { Badge } from "@informach/ui/components/badge";
import { EditNoticeAction } from "@/features/notices/components/edit-action";
import { OriginalNotice } from "@/features/notices/components/original-notice";
import {
  getNoticeActionHistory,
  getNoticeSource,
  listAssignableAdults,
} from "@/features/notices/repository";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { billing } from "@/lib/billing";
import { ACTIVITY_TYPE_LABELS } from "../activity-types";
import type { TaskRow } from "../task-repository";
import { toActivityView } from "../view";
import { ActivityCompletionButton } from "./completion-button";
import { ActivityDetailShell } from "./detail-shell";
import { ActivityRevisionList } from "./revision-list";

/**
 * O detalhe de uma atividade, qualquer que seja a sua história.
 *
 * Eram três páginas diferentes — a de recado tinha responsável, hora, local,
 * cancelamento e histórico; a escolar não tinha nada disso; a extracurricular
 * não existia. Com a tabela única elas passam a ser a mesma coisa, e o
 * formulário de edição passa a ser um só: a atividade escolar ganha hora,
 * local, responsável e lembrete por herança, sem campo novo em lugar nenhum.
 */
export async function ActivityDetail({ userId, task }: { userId: string; task: TaskRow }) {
  const view = toActivityView({ key: task.id, item: task }, userId);
  const [history, source, adults, isPro, subjectOptions] = await Promise.all([
    getNoticeActionHistory(userId, task.id),
    task.noticeId ? getNoticeSource(userId, task.noticeId) : null,
    listAssignableAdults(userId),
    billing.hasProSubscription({ type: "user", id: task.createdByUserId ?? userId }),
    listSubjectOptionsByProfile(userId),
  ]);

  return (
    <ActivityDetailShell
      profileName={task.profileName}
      title={task.title}
      meta={task.version > 1 ? `versão ${task.version}` : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{ACTIVITY_TYPE_LABELS[task.type]}</Badge>
        {view.shared ? (
          <Badge variant="outline" className="font-normal">
            Compartilhada com a turma
          </Badge>
        ) : null}
        {view.contextLine ? (
          <span className="text-sm text-muted-foreground">
            {[task.subjectName, view.contextLine, task.schoolName].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>

      {view.toggle ? (
        <ActivityCompletionButton
          id={view.toggle.id}
          version={view.toggle.version}
          initialStatus={task.status === "done" ? "done" : "pending"}
          title={task.title}
        />
      ) : null}

      <EditNoticeAction
        key={task.version}
        id={task.id}
        version={task.version}
        canceled={task.status === "canceled"}
        isPro={isPro}
        // Publicou outra família: a caixa fica marcada e travada.
        shareLocked={task.sharedActivityId !== null && task.createdByUserId !== userId}
        profiles={[{ id: task.profileId, name: task.profileName }]}
        adults={adults}
        subjectOptions={subjectOptions}
        initialValue={{
          type: task.type,
          title: task.title,
          description: task.description,
          dueAt: task.dueAt,
          dateOrigin: task.dateOrigin,
          time: task.time,
          location: task.location,
          sourceExcerpt: task.sourceExcerpt,
          subjectId: task.subjectId,
          profileSubjectId: task.profileSubjectId,
          profileId: task.profileId,
          assignedToUserId: task.assignedToUserId,
          recurrence: "none",
          reminderAt: null,
          shareWithTurma: task.sharedActivityId !== null,
        }}
      />

      {source ? (
        <OriginalNotice source={source} />
      ) : task.noticeId ? (
        <p className="text-sm text-muted-foreground">
          O acesso ao documento completo depende das crianças compartilhadas com você.
        </p>
      ) : null}

      <ActivityRevisionList revisions={history} />
    </ActivityDetailShell>
  );
}
