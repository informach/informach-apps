import "server-only";
import { db } from "@informach/db";
import { lockFamilyMembership } from "@informach/family/context";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { familyService } from "./repository";

export const FAMILY_COOKIE = "bt-familia";
export { familyService } from "./repository";

export function validateFamilyChoice(actorId: string, groupId: string) {
  return db.transaction((tx) => lockFamilyMembership(tx, actorId, groupId));
}

/** A previous cookie is a preference, never evidence of current membership. */
export async function requireFamilyContext(actorId: string) {
  const groups = await familyService.listGroups(actorId);
  const chosen = (await cookies()).get(FAMILY_COOKIE)?.value;
  const group = chosen
    ? groups.find((candidate) => candidate.id === chosen)
    : groups.length === 1
      ? groups[0]
      : undefined;
  if (!group) redirect("/contexto");
  return group;
}
