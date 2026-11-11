import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaFamilySettings,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
} from "@informach/db/schema";
import { familyMembershipCondition } from "@informach/family/access";
import { lockFamilyMembership } from "@informach/family/context";
import { accessibleProfileCondition } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { activeMembershipCondition } from "@/features/turmas/access";

export async function isFirstStepsDismissed(actor: AgendaAuthority): Promise<boolean> {
  const [row] = await db
    .select({ dismissedAt: agendaFamilySettings.firstStepsDismissedAt })
    .from(agendaFamilySettings)
    .where(
      and(
        eq(agendaFamilySettings.userId, actor.userId),
        eq(agendaFamilySettings.familyGroupId, actor.familyGroupId),
        familyMembershipCondition(actor.userId, agendaFamilySettings.familyGroupId),
      ),
    );
  return Boolean(row?.dismissedAt);
}

export async function dismissFirstSteps(actor: AgendaAuthority): Promise<void> {
  await db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const now = new Date();
    await tx
      .insert(agendaFamilySettings)
      .values({
        userId: actor.userId,
        familyGroupId: actor.familyGroupId,
        firstStepsDismissedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [agendaFamilySettings.familyGroupId, agendaFamilySettings.userId],
        set: { firstStepsDismissedAt: now, updatedAt: now },
      });
  });
}

/**
 * Turmas ativas das crianças da casa que ainda não têm nenhuma matéria com dias
 * de aula.
 *
 * Diferente da consulta anterior (removida junto com o widget que a usava,
 * e recuperável no histórico), que só enxergava turmas
 * CRIADAS pela conta: quem entrou por código ficaria com a lista sempre vazia
 * e um passo que nunca fecha nem leva a lugar nenhum. Criar matéria é direito
 * de qualquer membro da turma, então o destino vale para os dois casos. E o
 * critério é o horário, não a existência da matéria: matéria sem dias de aula
 * não sugere prazo nem monta a mochila de amanhã, que é o que este passo
 * promete.
 */
export async function listTurmasNeedingScheduleForUser(
  actor: AgendaAuthority,
): Promise<Array<{ turmaId: string }>> {
  return db
    .selectDistinct({ turmaId: agendaTurmas.id })
    .from(agendaStudentProfiles)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaStudentProfiles.activeTurmaId))
    .where(
      and(
        accessibleProfileCondition(actor),
        accessibleProfileCondition(actor, "write"),
        activeMembershipCondition(),
        sql`NOT EXISTS (
          SELECT 1 FROM ${agendaSubjects}
          WHERE ${agendaSubjects.turmaId} = ${agendaTurmas.id}
            AND array_length(${agendaSubjects.classDays}, 1) > 0
        )`,
      ),
    );
}

/** A família já tem alguma atividade, de qualquer origem. É um sim/não: `limit(1)`. */
export async function hasAnyActivity(actor: AgendaAuthority): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaTasks.id })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(accessibleProfileCondition(actor))
    .limit(1);
  return Boolean(row);
}
