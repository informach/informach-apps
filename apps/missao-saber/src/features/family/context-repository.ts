import "server-only";
import { db } from "@informach/db";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";

export const familyService = createFamilyService({ db });
export function validateFamilyChoice(actorId: string, groupId: string) {
  return db.transaction((tx) => lockFamilyMembership(tx, actorId, groupId));
}
