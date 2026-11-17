import "server-only";
import { getAgendaAiBalance } from "@/features/ai/wallet-repository";
import { listAccessibleProfiles } from "@/features/family/access";
import { familyAccountUrl } from "@/features/family/account-link";
import type { AgendaAuthority } from "@/features/family/authority";
import type { AddEntitlement } from "./entitlement";
export async function getAddEntitlement(actor: AgendaAuthority): Promise<AddEntitlement> {
  const [balance, profiles] = await Promise.all([
    getAgendaAiBalance(actor),
    listAccessibleProfiles(actor),
  ]);
  return {
    creditsAvailable: balance.available,
    aiProfileIds: profiles.filter((p) => p.canWrite && p.canUseAi).map((p) => p.id),
    writeProfileIds: profiles.filter((p) => p.canWrite).map((p) => p.id),
    accountHref: familyAccountUrl(actor.familyGroupId),
  };
}
