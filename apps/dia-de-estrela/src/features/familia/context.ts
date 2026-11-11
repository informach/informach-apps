import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdultAuthority } from "./authority";
import { familyService } from "./context-repository";

export const FAMILY_COOKIE = "dde-familia";
/** A preference only: each request resolves current membership from the shared service. */
export async function selectedFamilyContext(userId: string) {
  const groups = await familyService.listGroups(userId);
  const selected = (await cookies()).get(FAMILY_COOKIE)?.value;
  return (
    (selected
      ? groups.find((group) => group.id === selected)
      : groups.length === 1
        ? groups[0]
        : null) ?? null
  );
}
export async function requireFamilyContext(userId: string) {
  const group = await selectedFamilyContext(userId);
  if (!group) redirect("/contexto");
  return group;
}
export async function adultAuthority(userId: string): Promise<AdultAuthority> {
  const group = await requireFamilyContext(userId);
  return { kind: "adult", userId, familyGroupId: group.id };
}
