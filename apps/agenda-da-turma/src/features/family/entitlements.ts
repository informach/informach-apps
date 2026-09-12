import "server-only";
import { billing } from "@/lib/billing";
import { listAccessibleProfiles } from "./access";

export async function getFamilyEntitlements(userId: string) {
  const profiles = await listAccessibleProfiles(userId);
  const owners = [...new Set([userId, ...profiles.map((p) => p.userId)])];
  const plans = await Promise.all(
    owners.map(async (id) => ({ id, pro: await billing.hasProSubscription({ type: "user", id }) })),
  );
  const proOwners = plans.filter((p) => p.pro).map((p) => p.id);
  return {
    enabled: proOwners.length > 0,
    proProfileIds: profiles.filter((p) => proOwners.includes(p.userId)).map((p) => p.id),
    proOwnerIds: proOwners,
  };
}
