import "server-only";
import { and, db, eq } from "@informach/db";
import { familyAppProfiles } from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { agendaAccessInTransaction } from "@/features/billing/access-repository";
import { groupStudentIds } from "@/features/students/repository";
import type { AgendaAuthority } from "./authority";

import { familyService } from "./service-repository";

export function validateFamilyChoice(userId: string, groupId: string) {
  return db.transaction((tx) => lockFamilyMembership(tx, userId, groupId));
}

export async function activationChoices(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
    const people = await familyService.listPeople(actor.userId, actor.familyGroupId);
    const activated = await tx
      .select({ personId: familyAppProfiles.personId })
      .from(familyAppProfiles)
      .where(
        and(
          eq(familyAppProfiles.groupId, actor.familyGroupId),
          eq(familyAppProfiles.app, "agenda-da-turma"),
        ),
      );
    return people
      .filter(
        (p) =>
          p.kind === "dependent" &&
          p.canManageIdentity &&
          !activated.some((a) => a.personId === p.id),
      )
      .map((p) => ({ id: p.id, name: p.displayName, color: p.color }));
  });
}

export async function activationOverview(actor: AgendaAuthority) {
  return db.transaction(async (tx) => {
    const membership = await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const access = await agendaAccessInTransaction(tx, actor);
    const canActivate = membership.role === "administrator";
    return {
      canActivate,
      limit: access.profileLimit,
      currentCount: canActivate ? (await groupStudentIds(tx, actor)).length : 0,
    };
  });
}
