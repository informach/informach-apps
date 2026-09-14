import "server-only";
import { db, inArray, sql } from "@informach/db";
import { users } from "@informach/db/schema";

function exclusion(column: string, ids: string[]) {
  if (!ids.length) return sql``;
  const values = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  return sql`and ${sql.raw(column)} not in (${values})`;
}

/** Aggregate product facts only. The result never includes identities, answers or notebook text. */
export async function productMetrics(excludedEmails: string[], generatedAt = new Date()) {
  const normalized = [
    ...new Set(excludedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  const excludedUsers = normalized.length
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(sql`lower(${users.email})`, normalized))
    : [];
  const ids = excludedUsers.map((user) => user.id);
  const generatedAtIso = generatedAt.toISOString();
  const rows = await db.execute(sql`
    with first_mission as (
      select profile.user_id, min(session.completed_at) as first_at
      from missao_saber.profiles profile
      join missao_saber.sessions session on session.profile_id = profile.id
      where session.mode = 'mission' and session.completed_at is not null
        ${exclusion("profile.user_id", ids)}
      group by profile.user_id
    ), retention as (
      select first_mission.user_id, first_mission.first_at,
        exists (
          select 1 from missao_saber.profiles later_profile
          join missao_saber.sessions later_session on later_session.profile_id = later_profile.id
          where later_profile.user_id = first_mission.user_id
            and later_session.completed_at is not null
            and (later_session.completed_at at time zone 'America/Sao_Paulo')::date >=
              (first_mission.first_at at time zone 'America/Sao_Paulo')::date + 7
            and (later_session.completed_at at time zone 'America/Sao_Paulo')::date <=
              (first_mission.first_at at time zone 'America/Sao_Paulo')::date + 13
        ) as returned
      from first_mission
      where (first_mission.first_at at time zone 'America/Sao_Paulo')::date <
        (${generatedAtIso}::timestamptz at time zone 'America/Sao_Paulo')::date - 13
    )
    select
      (select count(*)::int from missao_saber.families family where true
        ${exclusion("family.user_id", ids)}) as families,
      (select count(distinct profile.user_id)::int from missao_saber.profiles profile where true
        ${exclusion("profile.user_id", ids)}) as first_profiles,
      (select count(*)::int from first_mission) as first_missions,
      (select count(*)::int from retention) as retention_eligible,
      (select count(*) filter (where returned)::int from retention) as returned_week_two,
      (select count(distinct audit.actor_id)::int from audit.events audit
        where audit.event_type = 'billing.checkout_started'
          and audit.payload->>'productId' in (
            'missao_individual_monthly', 'missao_individual_annual',
            'missao_family_monthly', 'missao_family_annual'
          )
          and audit.actor_id is not null ${exclusion("audit.actor_id", ids)}) as checkout_started,
      (select count(distinct customer.subject_id)::int
        from billing.customers customer
        join billing.subscriptions subscription on subscription.customer_id = customer.id
        where customer.app = 'missao-saber' and customer.subject_type = 'user'
          and subscription.product_id in (
            'missao_individual_monthly', 'missao_individual_annual',
            'missao_family_monthly', 'missao_family_annual'
          )
          and subscription.confirmed_at is not null
          ${exclusion("customer.subject_id", ids)}) as subscription_confirmed
  `);
  const row = Array.from(rows)[0] as
    | {
        families: number;
        first_profiles: number;
        first_missions: number;
        retention_eligible: number;
        returned_week_two: number;
        checkout_started: number;
        subscription_confirmed: number;
      }
    | undefined;
  if (!row) throw new Error("Product metrics query returned no aggregate row");
  return {
    generatedAt,
    excludedTechnicalAccounts: ids.length,
    families: row.families,
    firstProfiles: row.first_profiles,
    firstMissions: row.first_missions,
    retentionEligible: row.retention_eligible,
    returnedWeekTwo: row.returned_week_two,
    checkoutStarted: row.checkout_started,
    subscriptionConfirmed: row.subscription_confirmed,
  };
}
