import { COMPASSO_LEGACY_CREDIT_POLICIES } from "@informach/config/collections";
import type { Database } from "@informach/db";
import { sql } from "drizzle-orm";

type Reader = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Pending signed events and unforwarded financial facts are unavailable for new spending.
 * Reads existing durable receipts; no duplicate webhook queue or raw payload is exposed.
 */
export async function hasPendingLegacyCreditReview(
  reader: Reader,
  context: { groupId: string } | { sourceApp: string; sourceUserId: string },
) {
  const migrated = "groupId" in context;
  const sources = migrated
    ? sql`select source_app as app, source_user_id as user_id from billing.credit_wallet_migrations where group_id = ${context.groupId}::uuid`
    : sql`select ${context.sourceApp}::text as app, ${context.sourceUserId}::text as user_id`;
  const historicalScopes = JSON.stringify(
    Object.fromEntries(
      Object.entries(COMPASSO_LEGACY_CREDIT_POLICIES).map(([app, policy]) => [
        app,
        policy.webhookScope,
      ]),
    ),
  );
  const [result] = await reader.execute<{ pending: boolean }>(sql`
    with sources as (${sources})
    select exists (
      select 1 from sources s
      join billing.customers c on c.app = s.app and c.subject_type = 'user' and c.subject_id = s.user_id and c.provider = 'stripe'
      join billing.webhook_events w on w.provider = 'stripe' and (w.app is null or w.app = s.app)
        and (w.provider_customer_id = c.provider_customer_id
          or coalesce(w.payload #>> '{data,object,customer,id}', w.payload #>> '{data,object,customer}') = c.provider_customer_id
          or exists (select 1 from billing.one_time_payments p where p.customer_id = c.id and p.provider = 'stripe' and p.credit_amount > 0
            and coalesce(w.payload #>> '{data,object,payment_intent,id}', w.payload #>> '{data,object,payment_intent}') = p.provider_payment_id)
          or (w.provider_customer_id is null and w.payload #>> '{data,object,customer}' is null
            and (w.app = s.app or (w.app is null and (starts_with(w.provider_event_id, s.app || ':')
              or starts_with(w.provider_event_id, (${historicalScopes}::jsonb ->> s.app) || ':'))))
            and not exists (select 1 from billing.one_time_payments p where p.provider = 'stripe'
              and p.provider_payment_id = coalesce(w.payload #>> '{data,object,payment_intent,id}', w.payload #>> '{data,object,payment_intent}'))))
      where w.processed_at is null and (w.event_type = 'charge.refunded' or w.event_type like 'charge.dispute.%')
    ) or exists (
      select 1 from sources s
      join billing.customers c on c.app = s.app and c.subject_type = 'user' and c.subject_id = s.user_id and c.provider = 'stripe'
      join billing.subscriptions sub on sub.customer_id = c.id and sub.provider = 'stripe'
      join billing.legacy_payment_evidence_reviews r on r.subscription_id = sub.id and r.resolved_at is null
    ) or exists (
      select 1 from sources s
      join billing.credit_ledger l on l.owner_type = 'user' and l.owner_id = s.user_id and l.app = s.app
      left join billing.credit_funding_states f on f.grant_entry_id = l.id
      where l.amount > 0 and (
        (l.entry_type = 'bonus_grant' and (l.funding_period_id is null or f.grant_entry_id is null))
        or (l.entry_type = 'purchase' and (l.payment_id is null or f.grant_entry_id is null))
      )
    ) or exists (
      select 1 from sources s
      join billing.credit_ledger l on l.owner_type = 'user' and l.owner_id = s.user_id and l.app = s.app
      left join billing.credit_wallet_migration_entries m on m.source_entry_id = l.id
      where ${migrated} and m.source_entry_id is null and l.entry_type not in ('expiration', 'consumption')
        and coalesce(l.effective_at, l.created_at) <= clock_timestamp()
    ) as pending
  `);
  if (!result || typeof result.pending !== "boolean")
    throw new Error("Legacy funding review is unavailable");
  return result.pending;
}
