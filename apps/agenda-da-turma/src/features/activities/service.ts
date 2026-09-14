import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { billing } from "@/features/billing/service";
import { findTurmaWithSchoolById } from "@/features/turmas/repository";
import { todayLocalIso } from "../dashboard/date";
import { FREE_ACTIVITY_LIMIT } from "./limits";
import {
  countActivitiesCreatedByUser,
  deleteActivityById,
  findActivityById,
  findActivityStatusForProfile,
  insertActivityWithStatuses,
  insertActivityWithStatusesWithinFreeLimit,
  listPendingSharedActivitiesForUser,
  listTurmasWithSubjectsForUserForm,
  profileBelongsToUser,
  subjectBelongsToTurma,
  updateActivityById,
  updateActivityStatusValue,
  upsertAcceptanceAndStatuses,
  userHasActiveProfileInTurma,
} from "./repository";
import type {
  CreateActivityInput,
  DeleteActivityInput,
  RespondSharedActivityInput,
  SetActivityStatusInput,
  UpdateActivityInput,
} from "./schemas";
import type { Activity, PendingSharedActivity, TurmaWithSubjectsForForm } from "./types";

export type ActivityError =
  | { code: "TURMA_NOT_FOUND" }
  | { code: "SUBJECT_NOT_FOUND" }
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "VERSION_CONFLICT" }
  | { code: "NOT_SHARED" }
  | { code: "PRO_REQUIRED" }
  | { code: "INVALID_PROFILE" }
  | { code: "DUE_DATE_PASSED" }
  | { code: "ACTIVITY_LIMIT_REACHED"; limit: number; current: number };

function userSubject(userId: string) {
  return { type: "user", id: userId } as const;
}

// Cria a atividade respeitando: (1) perfil ativo na turma, (2) matéria pertence
// à turma, (3) Pro pra visibility=shared (Free é forçado pra individual
// silenciosamente — UI já desabilita a opção; este é defesa em profundidade),
// (4) limite de FREE_ACTIVITY_LIMIT atividades total pra Free.
// Status rows iniciais são inseridos pra cada perfil ativo do creator.
export async function createActivity(
  userId: string,
  input: CreateActivityInput,
): Promise<Result<Activity, ActivityError>> {
  const turma = await findTurmaWithSchoolById(input.turmaId);
  if (!turma) return err({ code: "TURMA_NOT_FOUND" });

  const isMember = await userHasActiveProfileInTurma(userId, input.turmaId);
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  const isValidSubject = await subjectBelongsToTurma(input.subjectId, input.turmaId);
  if (!isValidSubject) return err({ code: "SUBJECT_NOT_FOUND" });

  const isPro = await billing.hasProSubscription(userSubject(userId));

  let visibility = input.visibility;
  if (visibility === "shared_with_turma" && !isPro) {
    visibility = "individual";
  }

  const payload = {
    turmaId: input.turmaId,
    subjectId: input.subjectId,
    createdByUserId: userId,
    type: input.type,
    visibility,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt,
  };

  if (!isPro) {
    const limited = await insertActivityWithStatusesWithinFreeLimit(payload, FREE_ACTIVITY_LIMIT);
    if (!limited.ok) {
      return err({
        code: "ACTIVITY_LIMIT_REACHED",
        limit: FREE_ACTIVITY_LIMIT,
        current: limited.current,
      });
    }
    return ok(limited.activity);
  }

  const activity = await insertActivityWithStatuses(payload);
  return ok(activity);
}

export async function updateActivity(
  userId: string,
  input: UpdateActivityInput,
): Promise<Result<Activity, ActivityError>> {
  const activity = await findActivityById(input.id);
  if (!activity) return err({ code: "NOT_FOUND" });
  if (activity.createdByUserId !== userId) return err({ code: "FORBIDDEN" });

  // Matéria precisa pertencer à turma original — defesa contra payload
  // adulterado tentando mover a atividade pra subject de outra turma.
  // Sempre valida contra activity.turmaId (banco), nunca contra input.
  const isValidSubject = await subjectBelongsToTurma(input.subjectId, activity.turmaId);
  if (!isValidSubject) return err({ code: "SUBJECT_NOT_FOUND" });

  // Free não pode tornar uma atividade compartilhada (mesma regra do create).
  // UI desabilita a opção; aqui é defesa em profundidade.
  const isPro = await billing.hasProSubscription(userSubject(userId));
  let visibility = input.visibility;
  if (visibility === "shared_with_turma" && !isPro) {
    visibility = "individual";
  }

  const updated = await updateActivityById(
    input.id,
    {
      subjectId: input.subjectId,
      type: input.type,
      visibility,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt,
    },
    userId,
    input.version,
  );
  if (updated === "VERSION_CONFLICT") return err({ code: "VERSION_CONFLICT" });
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

  const removed = await deleteActivityById(input.id, userId);
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
  if (!activity || activity.canceledAt) return err({ code: "NOT_FOUND" });
  if (activity.visibility !== "shared_with_turma") return err({ code: "NOT_SHARED" });
  if (activity.createdByUserId === userId) return err({ code: "FORBIDDEN" });

  // Atividade com prazo passado nunca é oferecida pra aceitar/rejeitar — em
  // qualquer circunstância. Defesa em camadas: a query do widget já esconde,
  // mas blindamos contra request manual e race condition (atividade venceu
  // entre o load do widget e o clique).
  if (activity.dueAt < todayLocalIso()) return err({ code: "DUE_DATE_PASSED" });

  // User só pode responder se tem perfil ativo na turma — senão a aceitação
  // não geraria status rows pra ninguém.
  const isMember = await userHasActiveProfileInTurma(userId, activity.turmaId);
  if (!isMember) return err({ code: "NOT_A_MEMBER" });

  const responded = await upsertAcceptanceAndStatuses(
    activity.id,
    userId,
    input.accepted,
    activity.turmaId,
  );
  if (responded === false) return err({ code: "NOT_FOUND" });
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

  const isPro =
    input.status === "pending" &&
    (await billing.hasProSubscription(userSubject(statusRow.ownerUserId)));
  const updated = await updateActivityStatusValue(
    statusRow.id,
    input.status,
    userId,
    input.status === "pending" && !isPro ? FREE_ACTIVITY_LIMIT : null,
  );
  if (typeof updated === "object")
    return err({
      code: "ACTIVITY_LIMIT_REACHED",
      limit: FREE_ACTIVITY_LIMIT,
      current: updated.limitReached,
    });
  if (!updated) return err({ code: "NOT_FOUND" });
  return ok({ statusId: statusRow.id });
}

export async function getActivitiesCreatedCountForUser(userId: string): Promise<number> {
  return countActivitiesCreatedByUser(userId);
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
