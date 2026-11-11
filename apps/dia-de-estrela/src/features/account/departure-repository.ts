import "server-only";
import type { DepartureAssessment } from "@informach/account/departure-reviews";
import { db, sql } from "@informach/db";
import { assessAppProfileResponsibilities } from "@informach/family/departure";

export function assessEstrelaDeparture(actorId: string): Promise<DepartureAssessment> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10000ms'`);
    const profiles = await assessAppProfileResponsibilities(tx, actorId, "dia-de-estrela");
    const [local] = await tx.execute<{
      personal: boolean;
      shared: boolean;
      activeCredentials: number;
      pendingOperations: number;
    }>(sql`select (
      exists (select 1 from dia_de_estrela.devices where user_id = ${actorId})
      or exists (select 1 from dia_de_estrela.push_subscriptions where user_id = ${actorId})
      or exists (select 1 from dia_de_estrela.notification_deliveries where user_id = ${actorId})
    ) as personal,
    exists (select 1 from dia_de_estrela.families f
      join family.members m on m.group_id = f.family_group_id
      where m.user_id = ${actorId} and m.revoked_at is null) as shared,
    (select count(*)::integer from dia_de_estrela.devices where user_id = ${actorId}
      and revoked_at is null and expires_at > clock_timestamp()) as "activeCredentials",
    (select count(*)::integer from dia_de_estrela.notification_deliveries
      where user_id = ${actorId} and status = 'processing') as "pendingOperations"`);
    if (!local) throw new Error("Estrela departure assessment unavailable");
    return {
      version: 1,
      ...profiles,
      hasPersonalData: profiles.hasPersonalData || local.personal,
      hasSharedData: profiles.managedProfiles > 0 || local.shared,
      activeCredentials: local.activeCredentials,
      pendingOperations: local.pendingOperations,
    };
  });
}
