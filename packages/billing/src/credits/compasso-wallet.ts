import type { Product } from "@informach/config";
import type { Database } from "@informach/db";
import {
  collectionAccounts,
  creditReservations,
  customers,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { assertFamilyMembership, lockFamilyMembership } from "@informach/family/context";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { hasPendingCompassoReview } from "../collection-jobs";
import { ReservationNotFoundError } from "../errors";
import type { Logger } from "../logger";
import type { BillingAuditEvent } from "../types";
import { getBalance } from "./balance";
import {
  type CommitReservationInput,
  type ConsumeCreditsInput,
  commitReservation,
  consumeCredits,
  type ReleaseReservationInput,
  type ReservationsDeps,
  type ReserveCreditsInput,
  releaseReservation,
  reserveCredits,
} from "./reservations";
import { authorizeCompassoSpend } from "./shared";
import { grantCalendarSubscriptionCredits } from "./subscription-grants";

type Context = { actorId: string; groupId: string };
type BoundInput<T> = Omit<T, "owner" | "actorUserId">;

/** Authenticated account/app composition. No Stripe request is needed to renew a paid month. */
export function createCompassoWallet(deps: {
  db: Database;
  products: readonly Product[];
  logger?: Logger;
  onAudit?: (event: BillingAuditEvent) => void;
  /** Additional domain authorization, under wallet → family locks, before spending. */
  authorizeSpend?: ReservationsDeps["authorizeSpend"];
}) {
  const creditDeps: ReservationsDeps = {
    ...deps,
    walletScope: "compasso",
    async authorizeSpend(tx, input) {
      await authorizeCompassoSpend(tx, input);
      await deps.authorizeSpend?.(tx, input);
    },
  };
  async function assertReservation(context: Context, id: string) {
    const [row] = await deps.db
      .select({ id: creditReservations.id })
      .from(creditReservations)
      .where(
        and(
          eq(creditReservations.id, id),
          eq(creditReservations.app, "compasso"),
          eq(creditReservations.ownerType, "family"),
          eq(creditReservations.ownerId, context.groupId),
          eq(creditReservations.actorUserId, context.actorId),
        ),
      )
      .limit(1);
    if (!row) throw new ReservationNotFoundError(id);
    // These ownership fields are immutable. Settlement remains possible after
    // revocation: it resolves a previously authorized call, never starts a new one.
  }
  async function prepare({ actorId, groupId }: Context) {
    await assertFamilyMembership(deps.db, actorId, groupId);
    // Display remains possible during financial review, but no new grant is issued.
    if (await hasPendingCompassoReview(deps.db, groupId)) return;
    const now = new Date();
    const candidates = await deps.db
      .selectDistinct({ id: subscriptions.id })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
      .innerJoin(
        subscriptionPaymentPeriods,
        eq(subscriptionPaymentPeriods.subscriptionId, subscriptions.id),
      )
      .where(
        and(
          eq(collectionAccounts.groupId, groupId),
          eq(collectionAccounts.collection, "compasso"),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          inArray(subscriptions.status, ["active", "past_due", "canceled"]),
          eq(subscriptionPaymentPeriods.fullyRefunded, false),
          eq(subscriptionPaymentPeriods.disputed, false),
          lte(subscriptionPaymentPeriods.periodStart, now),
          gt(subscriptionPaymentPeriods.periodEnd, now),
        ),
      )
      .orderBy(subscriptions.id);
    // Finish each subscription -> wallet transaction before spending takes wallet -> membership.
    // The invoice handler and cron use the very same immutable monthly receipt.
    for (const subscription of candidates)
      await grantCalendarSubscriptionCredits(
        { db: deps.db, app: "compasso", products: deps.products },
        { subscriptionId: subscription.id },
      );
  }
  function bound<T extends BoundInput<ReserveCreditsInput> | BoundInput<ConsumeCreditsInput>>(
    context: Context,
    input: T,
  ) {
    return {
      ...input,
      owner: { type: "family" as const, id: context.groupId },
      actorUserId: context.actorId,
    };
  }
  return {
    async getBalance(context: Context) {
      await prepare(context);
      return deps.db.transaction(async (tx) => {
        await lockFamilyMembership(tx, context.actorId, context.groupId);
        return getBalance({ db: tx, app: "compasso" }, { type: "family", id: context.groupId });
      });
    },
    async reserve(context: Context, input: BoundInput<ReserveCreditsInput>) {
      await prepare(context);
      return reserveCredits(creditDeps, bound(context, input));
    },
    async commit(context: Context, input: CommitReservationInput) {
      await assertReservation(context, input.reservationId);
      return commitReservation(creditDeps, input);
    },
    async release(context: Context, input: ReleaseReservationInput) {
      await assertReservation(context, input.reservationId);
      return releaseReservation(creditDeps, input);
    },
    async consume(context: Context, input: BoundInput<ConsumeCreditsInput>) {
      await prepare(context);
      return consumeCredits(creditDeps, bound(context, input));
    },
  };
}
