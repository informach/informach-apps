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
import { taskToActionInput } from "../edit-defaults";
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
    billing.hasProSubscription({ type: "user", id: task.ownerUserId }),
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
        // Montado por uma função pura e testada, e não campo a campo aqui: um
        // campo esquecido neste objeto não dá erro — vira o valor do formulário
        // e o banco recebe o esquecimento. Ver `edit-defaults.ts`.
        initialValue={taskToActionInput(task)}
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
