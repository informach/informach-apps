import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaFamilySettings,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";

export async function isFirstStepsDismissed(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ dismissedAt: agendaFamilySettings.firstStepsDismissedAt })
    .from(agendaFamilySettings)
    .where(eq(agendaFamilySettings.userId, userId));
  return Boolean(row?.dismissedAt);
}

export async function dismissFirstSteps(userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(agendaFamilySettings)
    .values({ userId, firstStepsDismissedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: agendaFamilySettings.userId,
      set: { firstStepsDismissedAt: now, updatedAt: now },
    });
}

/**
 * Turmas ativas das crianças da casa que ainda não têm nenhuma matéria com dias
 * de aula.
 *
 * Diferente de `findTurmasOfUserMissingSubjects`, que só enxerga turmas
 * CRIADAS pela conta: quem entrou por código ficaria com a lista sempre vazia
 * e um passo que nunca fecha nem leva a lugar nenhum. Criar matéria é direito
 * de qualquer membro da turma, então o destino vale para os dois casos. E o
 * critério é o horário, não a existência da matéria: matéria sem dias de aula
 * não sugere prazo nem monta a mochila de amanhã, que é o que este passo
 * promete.
 */
export async function listTurmasNeedingScheduleForUser(
  userId: string,
): Promise<Array<{ turmaId: string }>> {
  return db
    .selectDistinct({ turmaId: agendaTurmas.id })
    .from(agendaStudentProfiles)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaStudentProfiles.activeTurmaId))
    .where(
      and(
        accessibleProfileCondition(userId),
        sql`NOT EXISTS (
          SELECT 1 FROM ${agendaSubjects}
          WHERE ${agendaSubjects.turmaId} = ${agendaTurmas.id}
            AND array_length(${agendaSubjects.classDays}, 1) > 0
        )`,
      ),
    );
}

/** A família já tem alguma atividade, de qualquer origem. É um sim/não: `limit(1)`. */
export async function hasAnyActivity(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaTasks.id })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(accessibleProfileCondition(userId))
    .limit(1);
  return Boolean(row);
}
