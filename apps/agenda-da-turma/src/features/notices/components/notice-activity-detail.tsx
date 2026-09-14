import { listSubjectOptionsByProfile } from "@/features/subjects/options-service";
import { ActivityDetailShell } from "@/features/unified-activities/components/detail-shell";
import { ActivityRevisionList } from "@/features/unified-activities/components/revision-list";
import { billing } from "@/lib/billing";
import {
  type getNoticeAction,
  getNoticeActionHistory,
  getNoticeSource,
  listAssignableAdults,
} from "../repository";
import { EditNoticeAction } from "./edit-action";
import { OriginalNotice } from "./original-notice";

/**
 * Detalhe de uma atividade que veio de recado. Corpo movido de
 * `/recados/acoes/[id]`, que agora redireciona para cá — a atividade deixou de
 * morar sob a rota do recado que a originou.
 */
export async function NoticeActivityDetail({
  userId,
  id,
  found,
}: {
  userId: string;
  id: string;
  found: NonNullable<Awaited<ReturnType<typeof getNoticeAction>>>;
}) {
  const { action } = found;
  const [history, source, adults, isPro, subjectOptions] = await Promise.all([
    getNoticeActionHistory(userId, id),
    action.noticeId ? getNoticeSource(userId, action.noticeId) : null,
    listAssignableAdults(userId),
    billing.hasProSubscription({ type: "user", id: found.ownerUserId }),
    listSubjectOptionsByProfile(userId),
  ]);

  return (
    <ActivityDetailShell
      profileName={found.profileName}
      title={action.title}
      meta={`versão ${action.version}`}
    >
      <EditNoticeAction
        key={action.version}
        id={id}
        version={action.version}
        canceled={action.status === "canceled"}
        isPro={isPro}
        profiles={[{ id: action.profileId, name: found.profileName }]}
        adults={adults}
        subjectOptions={subjectOptions}
        initialValue={{
          type: action.type,
          title: action.title,
          description: action.description,
          dueAt: action.dueAt,
          dateOrigin: action.dateOrigin,
          time: action.time,
          location: action.location,
          sourceExcerpt: action.sourceExcerpt,
          subjectId: action.subjectId,
          profileSubjectId: action.profileSubjectId,
          profileId: action.profileId,
          assignedToUserId: action.assignedToUserId,
          recurrence: action.recurrence,
          reminderAt: action.reminderAt?.toISOString() ?? null,
        }}
      />
      {source ? (
        <OriginalNotice source={source} />
      ) : action.noticeId ? (
        <p className="text-sm text-muted-foreground">
          O acesso ao documento completo depende das crianças compartilhadas com você.
        </p>
      ) : null}
      <ActivityRevisionList revisions={history} />
    </ActivityDetailShell>
  );
}
