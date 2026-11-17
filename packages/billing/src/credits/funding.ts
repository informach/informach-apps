import type { Database } from "@informach/db";
import {
  creditFundingStates,
  creditLedger,
  customers,
  subscriptionPaymentPeriods,
  subscriptions,
} from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { resolveCreditOwner } from "../collection-accounts";
import { BillingError } from "../errors";
import { bindLegacySubscriptionGrants } from "./legacy-grant-funding";
import { lockCreditOwner } from "./locks";
import { forwardMigratedCreditEntry } from "./migration-forwarding";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Called in the same transaction as payment facts. No network requests under a wallet lock. */
export async function reconcileSubscriptionFunding(tx: Tx, subscriptionId: string) {
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
    .for("update");
  if (!sub) throw new BillingError("Subscription funding source is missing");
  const [customer] = await tx.select().from(customers).where(eq(customers.id, sub.customerId));
  if (!customer) throw new BillingError("Subscription funding customer is missing");
  const legacy = customer.app === "cozya" || customer.app === "agenda-da-turma";
  if (customer.app !== "compasso" && !legacy) return;
  if (customer.app === "compasso" && customer.subjectType !== "billing_account")
    throw new BillingError("Compasso funding requires a commercial account");
  if (legacy && customer.subjectType !== "user")
    throw new BillingError("Legacy subscription funding requires a personal account");
  const owner = await resolveCreditOwner(tx, customer.app, {
    type: customer.subjectType,
    id: customer.subjectId,
  });
  await lockCreditOwner(tx, owner);
  if (customer.app === "cozya" || customer.app === "agenda-da-turma")
    await bindLegacySubscriptionGrants(tx, {
      app: customer.app,
      userId: customer.subjectId,
      subscription: sub,
    });
  const grants = await tx
    .select({
      grant: creditLedger,
      period: subscriptionPaymentPeriods,
    })
    .from(creditLedger)
    .innerJoin(
      subscriptionPaymentPeriods,
      eq(subscriptionPaymentPeriods.id, creditLedger.fundingPeriodId),
    )
    .where(
      and(
        eq(subscriptionPaymentPeriods.subscriptionId, sub.id),
        eq(creditLedger.app, customer.app),
        eq(creditLedger.ownerType, owner.type),
        eq(creditLedger.ownerId, owner.id),
        eq(creditLedger.entryType, "bonus_grant"),
      ),
    );
  for (const { grant, period } of grants) {
    await setGrantFundingState(
      tx,
      grant,
      period.fullyRefunded || period.disputed,
      period.reconciledAt,
      {
        subscriptionId: sub.id,
        invoiceId: period.providerInvoiceId,
        reason: period.fullyRefunded
          ? "refunded"
          : period.disputed
            ? "disputed"
            : "funding_restored",
      },
    );
  }
}
/** Caller owns the wallet lock; state changes affect this original lot only. */
export async function setGrantFundingState(
  tx: Tx,
  grant: typeof creditLedger.$inferSelect,
  blocked: boolean,
  observedAt: Date,
  metadata: Record<string, unknown>,
) {
  if (
    grant.amount <= 0 ||
    !["purchase", "bonus_grant", "promo_grant", "adjustment"].includes(grant.entryType)
  )
    throw new BillingError("Funding state requires an original positive grant");
  const [checkpoint] = await tx
    .select()
    .from(creditFundingStates)
    .where(eq(creditFundingStates.grantEntryId, grant.id));
  if (checkpoint && checkpoint.observedAt > observedAt)
    throw new BillingError("Credit funding observation moved backwards");
  if (
    checkpoint &&
    checkpoint.observedAt.getTime() === observedAt.getTime() &&
    checkpoint.blocked !== blocked
  )
    throw new BillingError("Conflicting credit funding observation");
  if (blocked !== (checkpoint?.blocked ?? false)) {
    const [posted] = await tx
      .insert(creditLedger)
      .values({
        ownerType: grant.ownerType,
        ownerId: grant.ownerId,
        app: grant.app,
        entryType: blocked ? "funding_suspension" : "funding_restoration",
        amount: blocked ? -grant.amount : grant.amount,
        sourceEntryId: grant.id,
        createdAt: sql`clock_timestamp()`,
        metadata,
      })
      .returning({ id: creditLedger.id });
    if (!posted) throw new BillingError("Funding transition was not posted");
    await forwardMigratedCreditEntry(tx, posted.id, {
      app: grant.app,
      owner: { type: grant.ownerType, id: grant.ownerId },
    });
  }
  await tx
    .insert(creditFundingStates)
    .values({ grantEntryId: grant.id, blocked, observedAt })
    .onConflictDoUpdate({ target: creditFundingStates.grantEntryId, set: { blocked, observedAt } });
}
