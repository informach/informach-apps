import "server-only";

import { and, db, eq, or, sql } from "@informach/db";
import {
  agendaFamilyMembers,
  agendaFamilyProfileAccess,
  agendaStudentProfiles,
} from "@informach/db/schema";

// This predicate must be applied to every query returning child-specific data.
// It uses the authenticated adult; it never impersonates the household owner.
export function accessibleProfileCondition(userId: string) {
  return or(
    eq(agendaStudentProfiles.userId, userId),
    sql`EXISTS (
      SELECT 1 FROM ${agendaFamilyProfileAccess} fpa
      INNER JOIN ${agendaFamilyMembers} fm ON fm.id = fpa.member_id
      WHERE fpa.profile_id = ${agendaStudentProfiles.id} AND fm.user_id = ${userId}
        AND fm.owner_user_id = ${agendaStudentProfiles.userId}
    )`,
  );
}

export async function findAccessibleProfile(userId: string, profileId: string) {
  const [profile] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.id, profileId), accessibleProfileCondition(userId)))
    .limit(1);
  return profile ?? null;
}

export async function listAccessibleProfiles(userId: string) {
  return db.select().from(agendaStudentProfiles).where(accessibleProfileCondition(userId));
}

export async function canAccessProfile(userId: string, profileId: string): Promise<boolean> {
  return (await findAccessibleProfile(userId, profileId)) !== null;
}

/**
 * A família tem um segundo adulto?
 *
 * Responde em um round-trip. A pergunta era feita por `listAssignableAdults`,
 * que roda duas consultas em sequência, cada uma com um `IN (subquery)` sobre
 * os perfis acessíveis, e devolve uma linha por (perfil, adulto) só para o
 * JavaScript deduplicar — numa página de lista que é a mais visitada do app, e
 * para uma conta gratuita que nunca terá um segundo adulto.
 *
 * O schema garante no máximo um convidado por titular
 * (`agenda_family_one_guest_idx`), e a linha só nasce no aceite — convite
 * pendente mora em `family_invitations` e não conta.
 */
export async function hasSecondAdultInFamily(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaFamilyMembers.id })
    .from(agendaFamilyMembers)
    .where(or(eq(agendaFamilyMembers.ownerUserId, userId), eq(agendaFamilyMembers.userId, userId)))
    .limit(1);
  return row !== undefined;
}
