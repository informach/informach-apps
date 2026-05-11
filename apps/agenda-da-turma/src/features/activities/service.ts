import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { findTurmaWithSchoolById } from "@/features/turmas/repository";
import {
  deleteActivityById,
  findActivityById,
  findActivityStatusForProfile,
  hasOtherAcceptances,
  insertActivityWithStatuses,
  listActivitiesForUser,
  listPendingSharedActivitiesForUser,
  listTurmasWithSubjectsForUserForm,
  profileBelongsToUser,
  subjectBelongsToTurma,
  updateActivityById,
  updateActivityStatusValue,
  upsertAcceptanceAndStatuses,
  userIsTurmaCreatorOrMember,
} from "./repository";
import type {
  CreateActivityInput,
  DeleteActivityInput,
  RespondSharedActivityInput,
  SetActivityStatusInput,
  UpdateActivityInput,
} from "./schemas";
import type {
  Activity,
  ActivityListItem,
  PendingSharedActivity,
  TurmaWithSubjectsForForm,
} from "./types";

export type ActivityError =
  | { code: "TURMA_NOT_FOUND" }
  | { code: "SUBJECT_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "HAS_ACCEPTANCES" }
  | { code: "NOT_SHARED" }
  | { code: "INVALID_PROFILE" };

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Cria a atividade respeitando: (1) membership na turma, (2) matéria pertence
// à turma, (3) Pro pra visibility=shared (Free é forçado pra individual
// silenciosamente — UI já desabilita a opção; este é defesa em profundidade).
// Status rows iniciais são inseridos pra cada perfil ativo do creator.
export async function createActivity(
  userId: string,
  input: CreateActivityInput,
): Promise<Result<Activity, ActivityError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const isMember = await userIsTurmaCreatorOrMember(userId, input.turmaId);
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  const isValidSubject = await subjectBelongsToTurma(input.subjectId, input.turmaId);
  if (!isValidSubject) return err({ code: "SUBJECT_NOT_FOUND" });

  let visibility = input.visibility;
  if (visibility === "shared_with_turma") {
    const isPro = await billing.hasProSubscription(userSubject(userId));
    if (!isPro) visibility = "individual";
  }

  const activity = await insertActivityWithStatuses({
    turmaId: input.turmaId,
    subjectId: input.subjectId,
    createdByUserId: userId,
    type: input.type,
    visibility,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt,
  });

  return ok(activity);
}

export async function updateActivity(
  userId: string,
  input: UpdateActivityInput,
): Promise<Result<Activity, ActivityError>> {
  const activity = await findActivityById(input.id);
  if (!activity) return err({ code: "NOT_FOUND" });
  if (activity.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  // Atividades compartilhadas que já foram aceitas por outras famílias ficam
  // congeladas — alterar título/data/tipo confundiria quem já adicionou à
  // sua agenda. Individuais nunca têm acceptances, então não passam por aqui.
  if (activity.visibility === "shared_with_turma" && (await hasOtherAcceptances(activity.id))) {
    return err({ code: "HAS_ACCEPTANCES" });
  }

  const updated = await updateActivityById(input.id, {
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt,
  });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok(updated);
}

export async function deleteActivity(
  userId: string,
  input: DeleteActivityInput,
): Promise<Result<true, ActivityError>> {
  const activity = await findActivityById(input.id);
  if (!activity) return err({ code: "NOT_FOUND" });
  if (activity.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  if (activity.visibility === "shared_with_turma" && (await hasOtherAcceptances(activity.id))) {
    return err({ code: "HAS_ACCEPTANCES" });
  }

  const removed = await deleteActivityById(input.id);
  if (!removed) return err({ code: "NOT_FOUND" });
  return ok(true);
}

// Aceitar/rejeitar atividade compartilhada por outro user. Creator não passa
// por aqui — ele já tem statuses dos próprios perfis desde o create. Quando
// `accepted=true` e o user tem N perfis ativos na turma, geramos N status
// rows. Aceitar duas vezes é idempotente (ON CONFLICT DO NOTHING nos
// statuses). Mudar de mente (aceitar depois de rejeitar, ou vice-versa) só
// atualiza o flag na acceptance — status rows ficam até o user explicitamente
// rejeitar (rejeitar não remove rows existentes; é apenas para silenciar o
// widget, não pra deletar histórico).
export async function respondSharedActivity(
  userId: string,
  input: RespondSharedActivityInput,
): Promise<Result<{ activityId: string; accepted: boolean }, ActivityError>> {
  const activity = await findActivityById(input.activityId);
  if (!activity) return err({ code: "NOT_FOUND" });
  if (activity.visibility !== "shared_with_turma") return err({ code: "NOT_SHARED" });
  if (activity.createdByUserId === userId) return err({ code: "FORBIDDEN" });

  // User só pode responder se tem perfil ativo na turma — senão a aceitação
  // não geraria status rows pra ninguém.
  const isMember = await userIsTurmaCreatorOrMember(userId, activity.turmaId);
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  await upsertAcceptanceAndStatuses(activity.id, userId, input.accepted, activity.turmaId);
  return ok({ activityId: activity.id, accepted: input.accepted });
}

export async function setActivityStatus(
  userId: string,
  input: SetActivityStatusInput,
): Promise<Result<{ statusId: string }, ActivityError>> {
  const ownsProfile = await profileBelongsToUser(input.studentProfileId, userId);
  if (!ownsProfile) return err({ code: "INVALID_PROFILE" });

  const statusRow = await findActivityStatusForProfile(input.activityId, input.studentProfileId);
  if (!statusRow) return err({ code: "NOT_FOUND" });

  const updated = await updateActivityStatusValue(statusRow.id, input.status);
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok({ statusId: statusRow.id });
}

export async function getActivitiesForUser(
  userId: string,
  profileFilter: string | null,
): Promise<ActivityListItem[]> {
  return listActivitiesForUser(userId, profileFilter);
}

export async function getPendingSharedActivitiesForUser(
  userId: string,
): Promise<PendingSharedActivity[]> {
  return listPendingSharedActivitiesForUser(userId);
}

export async function getTurmasWithSubjectsForForm(
  userId: string,
): Promise<TurmaWithSubjectsForForm[]> {
  return listTurmasWithSubjectsForUserForm(userId);
}
