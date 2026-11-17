import "server-only";
import type { Access, Tier } from "@/features/acesso/policy";
import { getGroupAccess } from "@/features/billing/service";
import { assertAllowed } from "@/lib/errors";
import { enabledTrainerIds, familyService, getFamily, listProfiles } from "./repository";

/** Explicit context for an operation that may outlive a page or cookie selection. */
export async function familyState(actorId: string, groupId: string) {
  const groups = await familyService.listGroups(actorId);
  const group = groups.find((candidate) => candidate.id === groupId);
  assertAllowed(group, "ACCESS_DENIED", "Seu acesso a esta família não está disponível.");
  const [access, profiles, family] = await Promise.all([
    getGroupAccess(actorId, groupId),
    listProfiles(actorId, groupId),
    getFamily(actorId),
  ]);
  const allowed = new Set(await enabledTrainerIds(actorId, groupId, access.profileLimit));
  const plan: Access = {
    subscribed: access.subscribed,
    unlocked: access.unlocked,
    trial: access.trial,
    tier: access.tier as Tier,
    profileLimit: access.profileLimit,
  };
  return {
    group,
    access: plan,
    subscription: access.subscription,
    pagamentoAtrasado: access.pagamentoAtrasado,
    family,
    profiles: profiles.map((profile) => ({ ...profile, allowed: allowed.has(profile.id) })),
  };
}
