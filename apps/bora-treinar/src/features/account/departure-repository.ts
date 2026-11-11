import "server-only";
import type { DepartureAssessment } from "@informach/account/departure-reviews";
import { db, sql } from "@informach/db";
import { assessAppProfileResponsibilities } from "@informach/family/departure";

export function assessBoraDeparture(actorId: string): Promise<DepartureAssessment> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10000ms'`);
    const profiles = await assessAppProfileResponsibilities(tx, actorId, "bora-treinar");
    const [local] = await tx.execute<{ personal: boolean; shared: boolean }>(sql`select
      exists (select 1 from bora_treinar.families where user_id = ${actorId}) as personal,
      exists (select 1 from bora_treinar.challenges c
        join family.members m on m.group_id = c.family_group_id
        where m.user_id = ${actorId} and m.revoked_at is null and c.profile_id is null) as shared`);
    if (!local) throw new Error("Bora departure assessment unavailable");
    return {
      version: 1,
      ...profiles,
      hasPersonalData: profiles.hasPersonalData || local.personal,
      hasSharedData: profiles.managedProfiles > 0 || local.shared,
      // Pairing is bound to the original web session; it has no independent credential.
      activeCredentials: 0,
      pendingOperations: 0,
    };
  });
}
