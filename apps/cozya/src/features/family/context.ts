import "server-only";
import { cookies } from "next/headers";
import type { CozyaAuthority } from "./authority";
import { familyService } from "./service-repository";

export const FAMILY_COOKIE = "cozya-familia";

/** An absent/invalid choice never borrows another family's subscription or balance. */
export async function cozyaAuthority(userId: string): Promise<CozyaAuthority> {
  const groups = await familyService.listGroups(userId);
  const selected = (await cookies()).get(FAMILY_COOKIE)?.value;
  const group = selected
    ? groups.find((candidate) => candidate.id === selected)
    : groups.length === 1
      ? groups[0]
      : undefined;
  return { userId, familyGroupId: group?.id ?? null };
}
