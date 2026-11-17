import "server-only";
import type { DepartureAssessment } from "@informach/account/departure-reviews";
import { db, sql } from "@informach/db";
import { assessAppProfileResponsibilities } from "@informach/family/departure";

export function assessMissaoDeparture(actorId: string): Promise<DepartureAssessment> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10000ms'`);
    const profiles = await assessAppProfileResponsibilities(tx, actorId, "missao-saber");
    const [local] = await tx.execute<{
      personal: boolean;
      shared: boolean;
      activeCredentials: number;
    }>(sql`select (
      exists (select 1 from missao_saber.families where user_id = ${actorId})
      or exists (select 1 from missao_saber.study_devices where user_id = ${actorId})
      or exists (select 1 from missao_saber.reports where user_id = ${actorId})
    ) as personal, (
      exists (select 1 from missao_saber.family_challenges c
        join family.members m on m.group_id = c.family_group_id
        where m.user_id = ${actorId} and m.revoked_at is null)
      or exists (select 1 from missao_saber.competitions c
        join family.members m on m.group_id = c.family_group_id
        where m.user_id = ${actorId} and m.revoked_at is null)
    ) as shared,
    (select count(*)::integer from missao_saber.study_devices where user_id = ${actorId}
      and revoked_at is null and expires_at > clock_timestamp()) as "activeCredentials"`);
    if (!local) throw new Error("Missao departure assessment unavailable");
    return {
      version: 1,
      ...profiles,
      hasPersonalData: profiles.hasPersonalData || local.personal,
      hasSharedData: profiles.managedProfiles > 0 || local.shared,
      activeCredentials: local.activeCredentials,
      pendingOperations: 0,
    };
  });
}
