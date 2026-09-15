import "server-only";

import { err, ok, type Result } from "@informach/auth/server-actions";
import { todayLocalIso } from "../dashboard/date";
import {
  findActivityById,
  listPendingSharedActivitiesForUser,
  listTurmasWithSubjectsForUserForm,
  upsertAcceptanceAndTasks,
  userHasActiveProfileInTurma,
} from "./repository";
import type { RespondSharedActivityInput } from "./schemas";
import type { PendingSharedActivity, TurmaWithSubjectsForForm } from "./types";

/**
 * O que sobrou deste serviço é o aceite de uma atividade publicada por outra
 * família. Criar, editar e cancelar deixaram de morar aqui: são a mesma
 * gravação de qualquer atividade, em `features/notices`.
 */
export type ActivityError =
  | { code: "NOT_A_MEMBER" }
  | { code: "FORBIDDEN" }
  | { code: "NOT_FOUND" }
  | { code: "NOT_SHARED" }
  | { code: "DUE_DATE_PASSED" };

// Aceitar/rejeitar atividade compartilhada por outro user. Creator não passa
// por aqui — ele já tem tarefas das próprias crianças desde o create. Quando
// `accepted=true` e o user tem N crianças ativas na turma, geramos N tarefas.
// Aceitar duas vezes é idempotente (ON CONFLICT DO NOTHING). Mudar de mente
// (aceitar depois de rejeitar, ou vice-versa) só atualiza o flag na
// acceptance — as tarefas ficam: rejeitar silencia o widget, não apaga a
// rotina que a família já pode ter começado.
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

  const responded = await upsertAcceptanceAndTasks(
    activity.id,
    userId,
    input.accepted,
    activity.turmaId,
  );
  if (responded === false) return err({ code: "NOT_FOUND" });
  return ok({ activityId: activity.id, accepted: input.accepted });
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
