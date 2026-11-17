import { getCollectionApps } from "@informach/config/collections";
import { and, eq, inArray, or, sql } from "@informach/db";
import { collectionAccounts, creditReservations, customers, users } from "@informach/db/schema";

export const personalWebBillingApps = [
  "compasso",
  ...getCollectionApps("compasso").map((app) => app.slug),
];
export const eligiblePersonalBillingActor = (actorId: string) =>
  sql`exists (select 1 from ${users} u where u.id = ${actorId} and u.email_verified and (not u.banned or u.ban_expires_at <= now()))`;

/** Includes trial/bonus users who never needed a provider customer. Expiry does
 * not release an active reservation; another adult's shared-wallet use is theirs. */
export function activePersonalWebReservations(actorId: string) {
  return and(
    eq(creditReservations.status, "active"),
    inArray(creditReservations.app, personalWebBillingApps),
    or(
      eq(creditReservations.actorUserId, actorId),
      and(eq(creditReservations.ownerType, "user"), eq(creditReservations.ownerId, actorId)),
    ),
  );
}

/** Paying for a group is separate from being its current member. */
export function personalWebCustomerCondition(actorId: string) {
  return and(
    inArray(customers.app, personalWebBillingApps),
    or(
      and(eq(customers.subjectType, "user"), eq(customers.subjectId, actorId)),
      and(
        eq(customers.subjectType, "billing_account"),
        eq(customers.app, "compasso"),
        sql`exists (select 1 from ${collectionAccounts} a where a.id::text = ${customers.subjectId} and a.payer_user_id = ${actorId} and a.collection = 'compasso')`,
      ),
    ),
    eligiblePersonalBillingActor(actorId),
  );
}
