import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ParentAuthority } from "./authority";
import { familyService } from "./context-repository";

export const FAMILY_COOKIE = "ms-familia";
/** Cookie is a preference, never proof of membership or content access. */
export async function selectedFamilyContext(userId: string) {
  const groups = await familyService.listGroups(userId);
  const chosen = (await cookies()).get(FAMILY_COOKIE)?.value;
  const group = chosen
    ? groups.find((candidate) => candidate.id === chosen)
    : groups.length === 1
      ? groups[0]
      : undefined;
  return group ?? null;
}
export async function requireFamilyContext(userId: string) {
  const group = await selectedFamilyContext(userId);
  if (!group) redirect("/contexto");
  return group;
}
export async function parentAuthority(userId: string): Promise<ParentAuthority> {
  const group = await requireFamilyContext(userId);
  return { kind: "parent", userId, familyGroupId: group.id };
}
