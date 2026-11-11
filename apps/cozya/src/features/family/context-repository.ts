import "server-only";
import { db } from "@informach/db";
import { lockFamilyMembership } from "@informach/family/context";
export async function validateFamilyChoice(userId: string, groupId: string | null) {
  if (groupId) await db.transaction((tx) => lockFamilyMembership(tx, userId, groupId));
}
