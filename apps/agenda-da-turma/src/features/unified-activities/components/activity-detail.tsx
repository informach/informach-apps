import { listAccessibleProfiles } from "@/features/family/access";
import { EditNoticeAction } from "@/features/notices/components/edit-action";
import { OriginalNotice } from "@/features/notices/components/original-notice";
import {
  getNoticeActionHistory,
  getNoticeSource,
  listAssignableAdults,
} from "@/features/notices/repository";
import { StudyPlanSection } from "@/features/study-plan/components/study-plan-section";
import { listStudySessions, STUDY_PLAN_TYPES } from "@/features/study-plan/service";
import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { billing } from "@/lib/billing";
import { taskToActionInput } from "../edit-defaults";
import type { TaskRow } from "../task-repository";
import { toActivityView } from "../view";
import { ActivityRead } from "./activity-read";
import { ActivityCompletionButton } from "./completion-button";
import { ActivityDetailShell } from "./detail-shell";
import { ActivityRevisionList } from "./revision-list";

/**
 * O detalhe de uma atividade, qualquer que seja a sua história.
 *
 * Eram três páginas diferentes (a de recado tinha responsável, hora, local,
 * cancelamento e histórico; a escolar não tinha nada disso; a extracurricular
 * não existia). Com a tabela única elas passaram a ser a mesma coisa, e o
 * formulário de edição, um só.
 *
 * Tem dois modos. Por padrão, LER: o quê, quando, de onde veio a data, quem
 * cuida, com "Marcar como feito" no pé. Com `?editar=1`, o mesmo formulário
 * de sempre, e o histórico aberto embaixo, porque é ele que confirma o que a
 * gravação mudou.
 */
export async function ActivityDetail({
  userId,
  task,
  editing,
  historyOpen,
}: {
  userId: string;
  task: TaskRow;
  editing: boolean;
  historyOpen: boolean;
}) {
  const view = toActivityView({ key: task.id, item: task }, userId);
  const canceled = task.status === "canceled";
  // Cancelada não tem o que editar: o formulário ficaria todo travado.
  const inEditMode = editing && !canceled;

  if (inEditMode) {
    const [history, adults, isPro, subjectOptions, accessibleProfiles] = await Promise.all([
      getNoticeActionHistory(userId, task.id),
      listAssignableAdults(userId),
      billing.hasProSubscription({ type: "user", id: task.ownerUserId }),
      listSubjectOptionsByProfile(userId),
      listAccessibleProfiles(userId),
    ]);
    return (
      <ActivityDetailShell
        profileName={task.profileName}
        title={task.title}
        meta={task.version > 1 ? `versão ${task.version}` : undefined}
        backHref={`/atividades/${task.id}`}
      >
        <EditNoticeAction
          key={task.version}
          id={task.id}
          version={task.version}
          canceled={canceled}
          isPro={isPro}
          // Publicou outra família: a caixa fica marcada e travada.
          shareLocked={task.sharedActivityId !== null && task.createdByUserId !== userId}
          fromNotice={task.noticeId !== null}
          profiles={[{ id: task.profileId, name: task.profileName }]}
          adults={adults}
          subjectOptions={subjectOptions}
          // Sem isto, a criança COM turma e sem matérias via aqui o texto de
          // quem não tem turma, e o caminho de saída apontava para o lugar
          // errado justamente na tela em que ela tenta usar a matéria.
          profileTurmas={Object.fromEntries(accessibleProfiles.map((p) => [p.id, p.activeTurmaId]))}
          // Montado por uma função pura e testada, e não campo a campo aqui: um
          // campo esquecido neste objeto não dá erro, vira o valor do
          // formulário e o banco recebe o esquecimento. Ver `edit-defaults.ts`.
          initialValue={taskToActionInput(task)}
        />
        <ActivityRevisionList revisions={history} />
      </ActivityDetailShell>
    );
  }

  const [history, source, studySessions] = await Promise.all([
    getNoticeActionHistory(userId, task.id),
    task.noticeId ? getNoticeSource(userId, task.noticeId) : null,
    listStudySessions(userId, task.id),
  ]);
  const canPlanStudy =
    !canceled && Boolean(task.dueAt) && STUDY_PLAN_TYPES.some((type) => type === task.type);

  return (
    <ActivityRead
      task={task}
      canEdit
      sharedByMe={task.createdByUserId === userId}
      completion={
        view.toggle ? (
          <ActivityCompletionButton
            id={view.toggle.id}
            version={view.toggle.version}
            initialStatus={task.status === "done" ? "done" : "pending"}
            title={task.title}
          />
        ) : null
      }
      study={
        // Prova e trabalho são o que se PREPARA: a data marcada não diz quando
        // estudar, e é isso que separa preparado de improvisado na véspera. O
        // id é o destino de "Dividir o estudo nos dias livres", em Hoje.
        canPlanStudy ? (
          <div id="plano-de-estudo" className="scroll-mt-4">
            <StudyPlanSection
              taskId={task.id}
              sessions={studySessions.map((session) => ({
                id: session.id,
                title: session.title,
                dueAt: session.dueAt,
                status: session.status,
              }))}
            />
          </div>
        ) : null
      }
      original={
        source ? (
          <OriginalNotice source={source} title="De onde veio" />
        ) : task.noticeId ? (
          <p className="text-sm text-muted-foreground">
            O recado completo aparece para quem acompanha todas as crianças dele.
          </p>
        ) : null
      }
      history={<ActivityRevisionList revisions={history} heading={false} />}
      historyCount={history.length}
      historyOpen={historyOpen}
    />
  );
}
