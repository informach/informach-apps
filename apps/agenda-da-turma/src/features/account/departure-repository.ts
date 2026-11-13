import "server-only";
import type { DepartureAssessment } from "@informach/account/departure-reviews";
import { db, sql } from "@informach/db";
import { assessAppProfileResponsibilities } from "@informach/family/departure";

export function assessAgendaDeparture(actorId: string): Promise<DepartureAssessment> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10000ms'`);
    const profiles = await assessAppProfileResponsibilities(tx, actorId, "agenda-da-turma");
    const [local] = await tx.execute<{
      personal: boolean;
      shared: boolean;
      activeCredentials: number;
      pendingOperations: number;
    }>(sql`select (
      exists (select 1 from agenda.family_settings where user_id = ${actorId})
      or exists (select 1 from agenda.notification_preferences where user_id = ${actorId})
      or exists (select 1 from agenda.push_subscriptions where user_id = ${actorId})
      or exists (select 1 from agenda.notification_deliveries where user_id = ${actorId})
      or exists (select 1 from agenda.calendar_feeds where user_id = ${actorId})
      or exists (select 1 from agenda.activity_acceptances where user_id = ${actorId})
      or exists (select 1 from agenda.idempotent_writes where user_id = ${actorId})
      or exists (select 1 from agenda.product_events where user_id = ${actorId})
      or exists (select 1 from ai.operation_receipts where app = 'agenda-da-turma' and actor_user_id = ${actorId})
      or exists (select 1 from ai.agent_runs r where app = 'agenda-da-turma' and (
        r.metadata->>'userId' = ${actorId} or r.id in (select id from billing.credit_reservations where
          (app = 'agenda-da-turma' and owner_type = 'user' and owner_id = ${actorId})
          or (app = 'compasso' and consumer_app = 'agenda-da-turma' and actor_user_id = ${actorId}))
      ))
    ) as personal,
    exists (select 1 from agenda.notices where created_by_user_id = ${actorId}) as shared,
    (select count(*)::integer from agenda.calendar_feeds where user_id = ${actorId}
      and revoked_at is null and (expires_at is null or expires_at > clock_timestamp())) as "activeCredentials",
    (select count(*)::integer from (
      select coalesce(billing_run_id, id) as id from agenda.notices
        where created_by_user_id = ${actorId} and status = 'processing'
      union select run_id from ai.operation_receipts where app = 'agenda-da-turma'
        and actor_user_id = ${actorId} and phase = 'processing'
      union select id from billing.credit_reservations where status = 'active' and (
        (app = 'agenda-da-turma' and owner_type = 'user' and owner_id = ${actorId})
        or (app = 'compasso' and consumer_app = 'agenda-da-turma' and actor_user_id = ${actorId}))
      union select id from agenda.notification_deliveries where user_id = ${actorId} and status = 'processing'
    ) pending) as "pendingOperations"`);
    if (!local) throw new Error("Agenda departure assessment unavailable");
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
