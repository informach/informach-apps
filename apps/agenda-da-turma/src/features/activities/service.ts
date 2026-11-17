import "server-only";
import { err } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { AgendaAuthority } from "@/features/family/authority";
import { listPendingSharedActivitiesForUser, upsertAcceptanceAndTasks } from "./repository";
import type { RespondSharedActivityInput } from "./schemas";
import type { PendingSharedActivity } from "./types";
export async function respondSharedActivity(
  actor: AgendaAuthority,
  input: RespondSharedActivityInput,
) {
  try {
    return await upsertAcceptanceAndTasks(actor, input);
  } catch (error) {
    if (!(error instanceof FamilyError)) throw error;
    return err({ code: "NOT_A_MEMBER" } as const);
  }
}
/** Each item commits independently; refusals leave no partial acceptance or task. */
export const ACCEPT_ALL_BATCH = 30;

export async function acceptAllSharedActivities(actor: AgendaAuthority) {
  const pending = await getPendingSharedActivitiesForUser(actor);
  // Teto por clique: cada item é uma transação própria, e o começo de um ano
  // letivo numa turma ativa traria centenas. Sem teto, a ação estoura o tempo
  // do servidor e a pessoa vê "não foi possível" sobre um lote que em parte
  // entrou. Com teto, o botão volta com o que ficou.
  const batch = pending.slice(0, ACCEPT_ALL_BATCH);
  let accepted = 0;
  let skipped = 0;
  for (const item of batch) {
    const result = await respondSharedActivity(actor, {
      activityId: item.activityId,
      accepted: true,
    });
    if (result.ok) accepted++;
    else skipped++;
  }
  return { accepted, skipped, remaining: Math.max(0, pending.length - batch.length) };
}

export async function getPendingSharedActivitiesForUser(
  actor: AgendaAuthority,
): Promise<PendingSharedActivity[]> {
  return listPendingSharedActivitiesForUser(actor);
}
