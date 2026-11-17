import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AgendaAuthority } from "./authority";
import { familyService } from "./service-repository";

export const FAMILY_COOKIE = "agenda-familia";

/** A cookie selects a context; current membership is always read from the service. */
export async function requireFamilyContext(userId: string) {
  const groups = await familyService.listGroups(userId);
  const selected = (await cookies()).get(FAMILY_COOKIE)?.value;
  const group = selected
    ? groups.find((g) => g.id === selected)
    : groups.length === 1
      ? groups[0]
      : null;
  if (!group) redirect("/contexto");
  return group;
}

export async function agendaAuthority(userId: string): Promise<AgendaAuthority> {
  const group = await requireFamilyContext(userId);
  return { userId, familyGroupId: group.id };
}
