import "server-only";
import { db, eq } from "@informach/db";
import {
  agendaActivities,
  agendaTurmas,
  cozyaAiOperations,
  cozyaProfiles,
} from "@informach/db/schema";

export type OutroApp = "Agenda da Turma" | "Cozya";

/**
 * A conta Informach é uma só, mas cada app apaga os próprios dados antes de
 * excluir o usuário: turmas e atividades da Agenda e o histórico de IA do
 * Cozya não caem sozinhos com a conta. Se a exclusão começasse aqui, esses
 * dados ficariam para trás. Então a exclusão vai pelo app que tem mais a
 * limpar; os perfis e os treinos do Bora Treinar saem em cascata com o usuário.
 */
export async function otherAppWithData(userId: string): Promise<OutroApp | null> {
  const [cozya] = await db
    .select({ userId: cozyaProfiles.userId })
    .from(cozyaProfiles)
    .where(eq(cozyaProfiles.userId, userId))
    .limit(1);
  const [cozyaIa] = cozya
    ? [cozya]
    : await db
        .select({ id: cozyaAiOperations.id })
        .from(cozyaAiOperations)
        .where(eq(cozyaAiOperations.userId, userId))
        .limit(1);
  if (cozyaIa) return "Cozya";
  const [turma] = await db
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(eq(agendaTurmas.createdByUserId, userId))
    .limit(1);
  if (turma) return "Agenda da Turma";
  const [atividade] = await db
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(eq(agendaActivities.createdByUserId, userId))
    .limit(1);
  return atividade ? "Agenda da Turma" : null;
}
