import "server-only";
import { and, db, eq } from "@informach/db";
import { familyAppProfiles } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import type { AdultAuthority } from "./authority";

export const familyService = createFamilyService({ db });
export function validateFamilyChoice(actorId: string, groupId: string) {
  return db.transaction((tx) => lockFamilyMembership(tx, actorId, groupId));
}

export async function activationChoices(actor: AdultAuthority) {
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId, "administrator");
    const people = await familyService.listPeople(actor.userId, actor.familyGroupId);
    const active = await tx
      .select({ personId: familyAppProfiles.personId })
      .from(familyAppProfiles)
      .where(
        and(
          eq(familyAppProfiles.groupId, actor.familyGroupId),
          eq(familyAppProfiles.app, "dia-de-estrela"),
        ),
      );
    return people
      .filter(
        (p) =>
          p.kind === "dependent" && p.canManageIdentity && !active.some((a) => a.personId === p.id),
      )
      .map((p) => ({ id: p.id, name: p.displayName, color: p.color }));
  });
}
