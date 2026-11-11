import { createHash } from "node:crypto";
import { lockRecentCentralAuthentication } from "@informach/auth/web-sessions";
import { isStripePriceIdConfigured, type Product, type StripeMode } from "@informach/config";
import { COMPASSO_POLICY, getCollectionApps } from "@informach/config/collections";
import type { Database } from "@informach/db";
import {
  collectionAccounts,
  customers,
  familyMigrationSources,
  legacyFutureIntents,
  subscriptions,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { assertAccountPayer } from "./collection-accounts";
import { withActiveCompassoBillingLock, withCompassoBillingLock } from "./credit-purchases";
import { refreshCompassoLegacySubscriptionFunding } from "./credits/legacy-subscriptions";
import { getOrCreateCustomer } from "./customers";
import { BillingError } from "./errors";
import { readLegacyFutureTerms } from "./legacy-future-terms";
import type { createStripeFutureContractProvider } from "./providers/stripe-future-contract";
import type { BillingProviderClient } from "./providers/types";

type Dependencies = { db: Database; products: readonly Product[]; mode: StripeMode };
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const inputSchema = z.object({
  accountId: z.uuid(),
  productId: z.enum(["compasso_monthly", "compasso_annual"]),
});

/** Billing ownership survives leaving the group; provider references remain private. */
export async function activeLegacyFutureIntent(db: Database, actorId: string, accountId: string) {
  z.uuid().parse(accountId);
  await assertAccountPayer(db, actorId, accountId);
  const [intent] = await db
    .select({
      id: legacyFutureIntents.id,
      state: legacyFutureIntents.state,
      productId: legacyFutureIntents.productId,
      amountCents: legacyFutureIntents.amountCents,
      interval: legacyFutureIntents.interval,
      startsAt: legacyFutureIntents.startsAt,
      paidThrough: legacyFutureIntents.paidThrough,
      cancelRequestedAt: legacyFutureIntents.cancelRequestedAt,
    })
    .from(legacyFutureIntents)
    .innerJoin(collectionAccounts, eq(collectionAccounts.id, legacyFutureIntents.accountId))
    .where(
      and(
        eq(legacyFutureIntents.accountId, accountId),
        eq(legacyFutureIntents.payerUserId, actorId),
        eq(collectionAccounts.payerUserId, actorId),
        eq(collectionAccounts.collection, "compasso"),
        inArray(legacyFutureIntents.state, [
          "setup_pending",
          "setup_ready",
          "scheduling",
          "scheduled",
          "review",
        ]),
      ),
    )
    .limit(1);
  return intent ?? null;
}

/** Terms and revision of the payer's future contract inside the caller's
 * transaction. Exported for the coordination that moves an accepted start. */
export function readLegacyFutureIntentTerms(
  tx: Tx,
  deps: Dependencies,
  actorId: string,
  input: z.infer<typeof inputSchema>,
) {
  return preview(tx, deps, actorId, input);
}

async function preview(
  tx: Tx,
  deps: Dependencies,
  actorId: string,
  input: z.infer<typeof inputSchema>,
) {
  const product = deps.products.find(
    (item) =>
      item.id === input.productId && item.app === "compasso" && item.kind === "subscription",
  );
  const interval = input.productId === "compasso_monthly" ? "month" : "year";
  const amountCents =
    interval === "month" ? COMPASSO_POLICY.monthlyAmountCents : COMPASSO_POLICY.annualAmountCents;
  const priceId = product?.stripePriceId[deps.mode];
  if (
    !product ||
    product.interval !== interval ||
    product.listPrice?.currency !== "BRL" ||
    product.listPrice.amountCents !== amountCents ||
    !priceId ||
    !isStripePriceIdConfigured(priceId)
  )
    throw new BillingError("Future Compasso price is not configured as approved");
  const terms = await readLegacyFutureTerms(tx, actorId, input.accountId);
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        policy: "compasso-future-2026-11-10-v1",
        terms: terms.revision,
        productId: input.productId,
        priceId,
        amountCents,
        interval,
      }),
    )
    .digest("hex");
  return { ...terms, revision, productId: input.productId, priceId, amountCents, interval };
}

/** The caller first refreshes all historical provider facts; this does not charge. */
export function previewLegacyFutureIntent(
  deps: Dependencies,
  actorId: string,
  raw: z.input<typeof inputSchema>,
) {
  const input = inputSchema.parse(raw);
  return deps.db.transaction((tx) => preview(tx, deps, actorId, input));
}

/** Refresh every known historical contract for the family before the preview.
 * The cutover inventory must first establish that local customers and contracts
 * include all Stripe records; this method cannot infer missing remote objects. */
export async function prepareLegacyFutureIntent(
  deps: Dependencies & {
    providerClient: Pick<BillingProviderClient, "readSubscriptionPaymentFacts">;
  },
  actorId: string,
  raw: z.input<typeof inputSchema>,
) {
  const input = inputSchema.parse(raw);
  const sources = await deps.db.transaction(async (tx) => {
    const { account } = await assertAccountPayer(tx, actorId, input.accountId);
    if (account.closedAt || account.collection !== "compasso")
      throw new BillingError("Future contract account is unavailable");
    await lockFamilyMembership(tx, actorId, account.groupId);
    const rows = await tx
      .select({ app: customers.app, providerSubscriptionId: subscriptions.providerSubscriptionId })
      .from(familyMigrationSources)
      .innerJoin(
        customers,
        and(
          eq(customers.app, familyMigrationSources.app),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, familyMigrationSources.sourceOwnerId),
          eq(customers.provider, "stripe"),
        ),
      )
      .innerJoin(subscriptions, eq(subscriptions.customerId, customers.id))
      .where(
        and(
          eq(familyMigrationSources.groupId, account.groupId),
          inArray(
            familyMigrationSources.app,
            getCollectionApps("compasso").map((app) => app.slug),
          ),
          eq(subscriptions.provider, "stripe"),
        ),
      )
      .limit(101);
    if (rows.length > 100) throw new BillingError("Historical contract set requires review");
    return rows;
  });
  for (const source of sources) {
    const refreshed = await refreshCompassoLegacySubscriptionFunding(
      { ...deps, app: source.app },
      source.providerSubscriptionId,
    );
    if (!refreshed) throw new BillingError("Historical contract is unavailable for reconciliation");
  }
  return previewLegacyFutureIntent(deps, actorId, input);
}

/** Commit the exact displayed terms before opening any external setup session. */
export async function createLegacyFutureIntent(
  deps: Dependencies,
  actorId: string,
  sessionId: string,
  raw: z.input<typeof inputSchema> & { revision: string; requestKey: string },
) {
  const input = inputSchema
    .extend({ revision: z.string().regex(/^[a-f0-9]{64}$/), requestKey: z.uuid() })
    .parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  return withActiveCompassoBillingLock(deps.db, actorId, input.accountId, () =>
    deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, input.accountId);
      if (account.collection !== "compasso")
        throw new BillingError("Future contract account is unavailable");
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [existing] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(
          and(
            eq(legacyFutureIntents.payerUserId, actorId),
            eq(legacyFutureIntents.requestKey, input.requestKey),
          ),
        );
      if (existing) {
        if (
          existing.accountId !== input.accountId ||
          existing.productId !== input.productId ||
          existing.termsRevision !== input.revision
        )
          throw new BillingError("Future contract request conflicts with an earlier intent");
        return existing;
      }
      const terms = await preview(tx, deps, actorId, input);
      if (terms.revision !== input.revision)
        throw new BillingError("Review the updated future contract terms");
      const [active] = await tx
        .select({ id: legacyFutureIntents.id })
        .from(legacyFutureIntents)
        .innerJoin(collectionAccounts, eq(collectionAccounts.id, legacyFutureIntents.accountId))
        .where(
          and(
            eq(collectionAccounts.groupId, terms.groupId),
            eq(collectionAccounts.collection, "compasso"),
            inArray(legacyFutureIntents.state, [
              "setup_pending",
              "setup_ready",
              "scheduling",
              "scheduled",
              "review",
            ]),
          ),
        )
        .limit(1);
      if (active) throw new BillingError("Another future contract is already being prepared");
      const now = Date.now();
      const setupExpiresAt = new Date(
        Math.floor(Math.min(now + 23 * 3600_000, terms.startsAt.getTime() - 5 * 60_000) / 1000) *
          1000,
      );
      if (setupExpiresAt.getTime() < now + 31 * 60_000)
        throw new BillingError("The paid period ends too soon to safely schedule a new contract");
      const [inserted] = await tx
        .insert(legacyFutureIntents)
        .values({
          accountId: terms.accountId,
          payerUserId: actorId,
          requestKey: input.requestKey,
          productId: terms.productId,
          providerPriceId: terms.priceId,
          amountCents: terms.amountCents,
          interval: terms.interval,
          paidThrough: terms.paidThrough,
          startsAt: terms.startsAt,
          termsRevision: terms.revision,
          setupExpiresAt,
          setupProtocolVersion: 1,
          scheduleProtocolVersion: 1,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted) throw new BillingError("Another future contract is already being prepared");
      return inserted;
    }),
  );
}

type SetupDependencies = Dependencies & {
  providerClient: BillingProviderClient;
  futureProvider: Pick<
    ReturnType<typeof createStripeFutureContractProvider>,
    "setup" | "expireSetup"
  >;
  publicUrl: string;
  verifyCatalog: () => Promise<void>;
};

type ReadSetupDependencies = Dependencies & {
  futureProvider: Pick<ReturnType<typeof createStripeFutureContractProvider>, "readSetup">;
  publicUrl: string;
};

function centralOrigin(deps: { publicUrl: string; mode: StripeMode }) {
  const origin = new URL(deps.publicUrl);
  if (
    origin.pathname !== "/" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !["http:", "https:"].includes(origin.protocol) ||
    (deps.mode === "prod" && origin.protocol !== "https:")
  )
    throw new BillingError("Invalid central billing origin");
  return origin.origin;
}

function setupInput(
  intent: typeof legacyFutureIntents.$inferSelect,
  customerId: string,
  origin: string,
) {
  const returnUrl = `${origin}/?pagamento=${intent.accountId}#compasso`;
  return {
    intentId: intent.id,
    customerId,
    expiresAt: Math.floor(intent.setupExpiresAt.getTime() / 1000),
    successUrl: returnUrl,
    cancelUrl: returnUrl,
  };
}

/** The receipt exists before network I/O. A lost response is recovered by the
 * provider's intent metadata; changed terms never expose the hosted URL. */
export async function openLegacyFutureSetup(
  deps: SetupDependencies,
  actorId: string,
  sessionId: string,
  raw: { intentId: string },
) {
  const input = z.object({ intentId: z.uuid() }).parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(
      and(eq(legacyFutureIntents.id, input.intentId), eq(legacyFutureIntents.payerUserId, actorId)),
    );
  if (!observed) throw new BillingError("Future contract is unavailable");
  const origin = centralOrigin(deps);
  return withActiveCompassoBillingLock(deps.db, actorId, observed.accountId, async () => {
    const authorized = await deps.db.transaction(async (tx) => {
      const { account, email } = await assertAccountPayer(tx, actorId, observed.accountId);
      if (account.closedAt || account.collection !== "compasso")
        throw new BillingError("Future contract account is unavailable");
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [intent] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(
          and(
            eq(legacyFutureIntents.id, observed.id),
            eq(legacyFutureIntents.accountId, account.id),
            eq(legacyFutureIntents.payerUserId, actorId),
          ),
        )
        .for("update");
      if (!intent || intent.state !== "setup_pending")
        throw new BillingError("Future setup is not pending");
      const terms = await preview(tx, deps, actorId, {
        accountId: account.id,
        productId: z.enum(["compasso_monthly", "compasso_annual"]).parse(intent.productId),
      });
      if (terms.revision !== intent.termsRevision)
        throw new BillingError("Future contract terms changed");
      return { intent, email };
    });
    await deps.verifyCatalog();
    const customer = await getOrCreateCustomer(
      {
        db: deps.db,
        app: "compasso",
        provider: "stripe",
        providerClient: deps.providerClient,
        organizationsEnabled: false,
      },
      {
        subject: { type: "billing_account", id: authorized.intent.accountId },
        actorId,
        email: authorized.email,
      },
    );
    const [commercial] = await deps.db
      .select()
      .from(customers)
      .where(eq(customers.id, customer.customerId));
    if (
      !commercial ||
      commercial.app !== "compasso" ||
      commercial.subjectType !== "billing_account" ||
      commercial.subjectId !== authorized.intent.accountId ||
      commercial.provider !== "stripe"
    )
      throw new BillingError("Future setup customer is unavailable");
    const setup = setupInput(authorized.intent, commercial.providerCustomerId, origin);
    await deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, authorized.intent.accountId);
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (account.closedAt || !(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const terms = await preview(tx, deps, actorId, {
        accountId: account.id,
        productId: z
          .enum(["compasso_monthly", "compasso_annual"])
          .parse(authorized.intent.productId),
      });
      if (terms.revision !== authorized.intent.termsRevision)
        throw new BillingError("Future contract terms changed");
      const [marked] = await tx
        .update(legacyFutureIntents)
        .set({
          setupAttemptedAt: sql`coalesce(${legacyFutureIntents.setupAttemptedAt}, clock_timestamp())`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(legacyFutureIntents.id, authorized.intent.id),
            eq(legacyFutureIntents.state, "setup_pending"),
          ),
        )
        .returning({ id: legacyFutureIntents.id });
      if (!marked) throw new BillingError("Future setup changed before provider request");
    });
    const remote = await deps.futureProvider.setup(setup);
    let valid: boolean;
    try {
      valid = await deps.db.transaction(async (tx) => {
        const { account } = await assertAccountPayer(tx, actorId, authorized.intent.accountId);
        await lockFamilyMembership(tx, actorId, account.groupId);
        if (account.closedAt || !(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
          throw new BillingError("Recent central authentication is required");
        let unchanged = true;
        try {
          const current = await preview(tx, deps, actorId, {
            accountId: account.id,
            productId: z
              .enum(["compasso_monthly", "compasso_annual"])
              .parse(authorized.intent.productId),
          });
          unchanged = current.revision === authorized.intent.termsRevision;
        } catch (error) {
          if (!(error instanceof BillingError)) throw error;
          unchanged = false;
        }
        const [updated] = await tx
          .update(legacyFutureIntents)
          .set({
            setupSessionId: remote.id,
            state: unchanged ? "setup_pending" : "review",
            cancelRequestedAt: unchanged ? null : new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(legacyFutureIntents.id, authorized.intent.id),
              eq(legacyFutureIntents.state, "setup_pending"),
            ),
          )
          .returning({ id: legacyFutureIntents.id });
        if (!updated) throw new BillingError("Future setup changed during provider request");
        return unchanged;
      });
    } catch (error) {
      // Keep the provider reference even if authorization was revoked while
      // Stripe was responding. Reconciliation can then finish cleanup.
      try {
        await deps.db
          .update(legacyFutureIntents)
          .set({
            setupSessionId: remote.id,
            state: "review",
            cancelRequestedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(legacyFutureIntents.id, authorized.intent.id),
              eq(legacyFutureIntents.state, "setup_pending"),
            ),
          );
      } finally {
        if (remote.status === "open") await deps.futureProvider.expireSetup(setup, remote.id);
      }
      throw error;
    }
    if (!valid) {
      if (remote.status === "open") await deps.futureProvider.expireSetup(setup, remote.id);
      throw new BillingError("Future contract terms changed; review is required");
    }
    return { intentId: authorized.intent.id, status: remote.status, url: remote.url };
  });
}

/** Verify the hosted authorization before advancing the durable intent. This
 * does not schedule or charge a subscription. */
export async function confirmLegacyFutureSetup(
  deps: ReadSetupDependencies,
  actorId: string,
  sessionId: string,
  raw: { intentId: string },
) {
  const { intentId } = z.object({ intentId: z.uuid() }).parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.payerUserId, actorId)));
  if (!observed) throw new BillingError("Future contract is unavailable");
  const origin = centralOrigin(deps);
  return withActiveCompassoBillingLock(deps.db, actorId, observed.accountId, async () => {
    const authorized = await deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, observed.accountId);
      if (account.closedAt || account.collection !== "compasso")
        throw new BillingError("Future contract account is unavailable");
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [intent] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(
          and(
            eq(legacyFutureIntents.id, intentId),
            eq(legacyFutureIntents.accountId, account.id),
            eq(legacyFutureIntents.payerUserId, actorId),
          ),
        )
        .for("update");
      if (intent?.state === "setup_ready") return { ready: true as const };
      if (!intent || intent.state !== "setup_pending" || !intent.setupSessionId)
        throw new BillingError("Future setup is not pending");
      const [customer] = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.provider, "stripe"),
            eq(customers.app, "compasso"),
            eq(customers.subjectType, "billing_account"),
            eq(customers.subjectId, account.id),
          ),
        );
      if (!customer) throw new BillingError("Future setup customer is unavailable");
      return { ready: false as const, intent, customer, setupSessionId: intent.setupSessionId };
    });
    if (authorized.ready) return { intentId, state: "setup_ready" as const };
    const setup = setupInput(authorized.intent, authorized.customer.providerCustomerId, origin);
    const remote = await deps.futureProvider.readSetup(setup, authorized.setupSessionId);
    if (remote.status === "complete" && !remote.paymentMethodId)
      throw new BillingError("Completed future setup has no payment method");
    return deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, observed.accountId);
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (account.closedAt || !(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      let unchanged = true;
      try {
        const current = await preview(tx, deps, actorId, {
          accountId: account.id,
          productId: z
            .enum(["compasso_monthly", "compasso_annual"])
            .parse(authorized.intent.productId),
        });
        unchanged = current.revision === authorized.intent.termsRevision;
      } catch (error) {
        if (!(error instanceof BillingError)) throw error;
        unchanged = false;
      }
      const state = !unchanged
        ? "review"
        : remote.status === "complete" && remote.paymentMethodId
          ? "setup_ready"
          : remote.status === "expired"
            ? "failed"
            : remote.status === "open"
              ? "setup_pending"
              : "review";
      const [updated] = await tx
        .update(legacyFutureIntents)
        .set({
          state,
          paymentMethodId: state === "setup_ready" ? remote.paymentMethodId : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(legacyFutureIntents.id, intentId),
            eq(legacyFutureIntents.state, "setup_pending"),
            eq(legacyFutureIntents.setupSessionId, authorized.setupSessionId),
          ),
        )
        .returning({ id: legacyFutureIntents.id });
      if (!updated) throw new BillingError("Future setup changed during provider request");
      return { intentId, state };
    });
  });
}

type ScheduleDependencies = Dependencies & {
  providerClient: Pick<BillingProviderClient, "readSubscriptionPaymentFacts">;
  futureProvider: Pick<
    ReturnType<typeof createStripeFutureContractProvider>,
    "findSchedule" | "schedule" | "cancelSchedule"
  >;
  verifyCatalog: () => Promise<void>;
};

/** The durable scheduling state is written before Stripe is called. Retrying
 * recovers an existing schedule first and never starts a second subscription. */
export async function scheduleLegacyFutureIntent(
  deps: ScheduleDependencies,
  actorId: string,
  sessionId: string,
  raw: { intentId: string },
) {
  const { intentId } = z.object({ intentId: z.uuid() }).parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.payerUserId, actorId)));
  if (!observed) throw new BillingError("Future contract is unavailable");
  return withActiveCompassoBillingLock(deps.db, actorId, observed.accountId, async () => {
    const authorized = await deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, observed.accountId);
      if (account.closedAt || account.collection !== "compasso")
        throw new BillingError("Future contract account is unavailable");
      await lockFamilyMembership(tx, actorId, account.groupId);
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [intent] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(
          and(
            eq(legacyFutureIntents.id, intentId),
            eq(legacyFutureIntents.accountId, account.id),
            eq(legacyFutureIntents.payerUserId, actorId),
          ),
        )
        .for("update");
      if (intent?.state === "scheduled") return { scheduled: true as const };
      if (
        !intent ||
        !["setup_ready", "scheduling"].includes(intent.state) ||
        !intent.paymentMethodId
      )
        throw new BillingError("Future setup is not ready for scheduling");
      const [customer] = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.provider, "stripe"),
            eq(customers.app, "compasso"),
            eq(customers.subjectType, "billing_account"),
            eq(customers.subjectId, account.id),
          ),
        );
      if (!customer) throw new BillingError("Future setup customer is unavailable");
      return {
        scheduled: false as const,
        intent,
        customer,
        paymentMethodId: intent.paymentMethodId,
      };
    });
    if (authorized.scheduled) return { intentId, state: "scheduled" as const };
    const intent = authorized.intent;
    const future = {
      intentId,
      customerId: authorized.customer.providerCustomerId,
      paymentMethodId: authorized.paymentMethodId,
      priceId: intent.providerPriceId,
      interval: z.enum(["month", "year"]).parse(intent.interval),
      startsAt: intent.startsAt.getTime() / 1000,
      paidThroughMs: intent.paidThrough.getTime(),
      amountCents: intent.amountCents,
    };
    const existing =
      intent.state === "scheduling" ? await deps.futureProvider.findSchedule(future) : null;
    const review = async (remote: { id: string; status: string } | null) => {
      try {
        await deps.db
          .update(legacyFutureIntents)
          .set({
            state: "review",
            scheduleId: remote?.id ?? null,
            cancelRequestedAt: remote ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(legacyFutureIntents.id, intentId),
              inArray(legacyFutureIntents.state, ["setup_ready", "scheduling"]),
            ),
          );
      } finally {
        if (remote?.status === "not_started")
          await deps.futureProvider.cancelSchedule(future, remote.id);
      }
    };
    try {
      const terms = await prepareLegacyFutureIntent(deps, actorId, {
        accountId: intent.accountId,
        productId: z.enum(["compasso_monthly", "compasso_annual"]).parse(intent.productId),
      });
      if (terms.revision !== intent.termsRevision)
        throw new BillingError("Future contract terms changed");
      await deps.verifyCatalog();
    } catch (error) {
      if (intent.state === "scheduling") await review(existing);
      throw error;
    }
    if (existing && existing.status !== "not_started") {
      await review(existing);
      throw new BillingError("Future schedule requires reconciliation");
    }
    const [claimed] = await deps.db
      .update(legacyFutureIntents)
      .set({
        state: "scheduling",
        scheduleAttemptedAt: sql`coalesce(${legacyFutureIntents.scheduleAttemptedAt}, clock_timestamp())`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(legacyFutureIntents.id, intentId),
          inArray(legacyFutureIntents.state, ["setup_ready", "scheduling"]),
        ),
      )
      .returning({ id: legacyFutureIntents.id });
    if (!claimed) throw new BillingError("Future intent changed before scheduling");
    const remote = existing ?? (await deps.futureProvider.schedule(future));
    if (remote.status !== "not_started") {
      await review(remote);
      throw new BillingError("Future schedule requires reconciliation");
    }
    try {
      return await deps.db.transaction(async (tx) => {
        const { account } = await assertAccountPayer(tx, actorId, intent.accountId);
        await lockFamilyMembership(tx, actorId, account.groupId);
        if (account.closedAt || !(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
          throw new BillingError("Recent central authentication is required");
        const terms = await preview(tx, deps, actorId, {
          accountId: account.id,
          productId: z.enum(["compasso_monthly", "compasso_annual"]).parse(intent.productId),
        });
        if (terms.revision !== intent.termsRevision)
          throw new BillingError("Future contract terms changed");
        const [updated] = await tx
          .update(legacyFutureIntents)
          .set({ state: "scheduled", scheduleId: remote.id, updatedAt: new Date() })
          .where(
            and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.state, "scheduling")),
          )
          .returning({ id: legacyFutureIntents.id });
        if (!updated) throw new BillingError("Future intent changed while scheduling");
        return { intentId, state: "scheduled" as const };
      });
    } catch (error) {
      await review(remote);
      throw error;
    }
  });
}

/** Internal recovery for an interrupted or invalidated schedule. It does not
 * create subscriptions or require the original browser session to survive. */
export async function cancelUnsettledLegacyFutureIntent(
  deps: {
    db: Database;
    futureProvider: Pick<
      ReturnType<typeof createStripeFutureContractProvider>,
      "findSchedule" | "cancelSchedule"
    >;
  },
  raw: { intentId: string },
) {
  const { intentId } = z.object({ intentId: z.uuid() }).parse(raw);
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(eq(legacyFutureIntents.id, intentId));
  if (!observed) throw new BillingError("Future contract is unavailable");
  return withCompassoBillingLock(observed.accountId, async () => {
    const [intent] = await deps.db
      .select()
      .from(legacyFutureIntents)
      .where(eq(legacyFutureIntents.id, intentId));
    if (intent?.state === "scheduled" || intent?.state === "applied")
      return { intentId, state: "unchanged" as const, providerStatus: "not_due" as const };
    if (intent?.state === "canceled" && intent.cancelRequestedAt && intent.scheduleId)
      return { intentId, state: "canceled" as const, providerStatus: "canceled" as const };
    if (!intent || !["scheduling", "review"].includes(intent.state) || !intent.paymentMethodId)
      throw new BillingError("Future intent has no unsettled scheduling operation");
    if (
      intent.state === "review" &&
      intent.cancelRequestedAt &&
      intent.scheduleProtocolVersion === 1 &&
      !intent.scheduleAttemptedAt &&
      !intent.scheduleId
    ) {
      const [settled] = await deps.db
        .update(legacyFutureIntents)
        .set({ state: "canceled", updatedAt: new Date() })
        .where(
          and(
            eq(legacyFutureIntents.id, intentId),
            eq(legacyFutureIntents.state, "review"),
            eq(legacyFutureIntents.scheduleProtocolVersion, 1),
            sql`${legacyFutureIntents.scheduleAttemptedAt} is null`,
            sql`${legacyFutureIntents.scheduleId} is null`,
            sql`${legacyFutureIntents.cancelRequestedAt} is not null`,
          ),
        )
        .returning({ id: legacyFutureIntents.id });
      if (!settled) throw new BillingError("Future scheduling changed before cancellation");
      return { intentId, state: "canceled" as const, providerStatus: "not_started" as const };
    }
    const [customer] = await deps.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.subjectId, intent.accountId),
        ),
      );
    if (!customer) throw new BillingError("Future setup customer is unavailable");
    const future = {
      intentId,
      customerId: customer.providerCustomerId,
      paymentMethodId: intent.paymentMethodId,
      priceId: intent.providerPriceId,
      interval: z.enum(["month", "year"]).parse(intent.interval),
      startsAt: intent.startsAt.getTime() / 1000,
      paidThroughMs: intent.paidThrough.getTime(),
      amountCents: intent.amountCents,
    };
    const remote = await deps.futureProvider.findSchedule(future);
    if (intent.scheduleId && remote?.id !== intent.scheduleId)
      throw new BillingError("Future schedule identity requires reconciliation");
    const [marked] = await deps.db
      .update(legacyFutureIntents)
      .set({
        state: "review",
        scheduleId: remote?.id ?? intent.scheduleId,
        cancelRequestedAt: intent.cancelRequestedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(legacyFutureIntents.id, intentId),
          inArray(legacyFutureIntents.state, ["scheduling", "review"]),
        ),
      )
      .returning({ id: legacyFutureIntents.id });
    if (!marked) throw new BillingError("Future intent changed during reconciliation");
    if (!remote)
      return { intentId, state: "review" as const, providerStatus: "not_found" as const };
    const providerStatus =
      remote.status === "not_started"
        ? (await deps.futureProvider.cancelSchedule(future, remote.id)).status
        : remote.status;
    if (providerStatus !== "canceled")
      throw new BillingError("Started future schedule requires financial reconciliation");
    const [settled] = await deps.db
      .update(legacyFutureIntents)
      .set({ state: "canceled", updatedAt: new Date() })
      .where(
        and(
          eq(legacyFutureIntents.id, intentId),
          eq(legacyFutureIntents.state, "review"),
          eq(legacyFutureIntents.scheduleId, remote.id),
        ),
      )
      .returning({ id: legacyFutureIntents.id });
    if (!settled) throw new BillingError("Future intent changed after cancellation");
    return { intentId, state: "canceled" as const, providerStatus };
  });
}

/** Recovery of a hosted setup never creates a new session. */
export async function cancelUnsettledLegacyFutureSetup(
  deps: {
    db: Database;
    mode: StripeMode;
    publicUrl: string;
    futureProvider: Pick<
      ReturnType<typeof createStripeFutureContractProvider>,
      "findSetupSession" | "expireSetup"
    >;
  },
  raw: { intentId: string },
) {
  const { intentId } = z.object({ intentId: z.uuid() }).parse(raw);
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(eq(legacyFutureIntents.id, intentId));
  if (!observed) throw new BillingError("Future contract is unavailable");
  const origin = centralOrigin(deps);
  return withCompassoBillingLock(observed.accountId, async () => {
    const [intent] = await deps.db
      .select()
      .from(legacyFutureIntents)
      .where(eq(legacyFutureIntents.id, intentId));
    if (intent?.state === "canceled" && intent.cancelRequestedAt)
      return { intentId, state: "canceled" as const, providerStatus: "canceled" as const };
    if (
      !intent ||
      intent.state !== "review" ||
      !intent.cancelRequestedAt ||
      intent.paymentMethodId ||
      intent.scheduleId
    )
      throw new BillingError("Future setup is not pending cancellation");
    if (intent.setupProtocolVersion === 1 && !intent.setupAttemptedAt && !intent.setupSessionId) {
      const [settled] = await deps.db
        .update(legacyFutureIntents)
        .set({ state: "canceled", updatedAt: new Date() })
        .where(
          and(
            eq(legacyFutureIntents.id, intentId),
            eq(legacyFutureIntents.state, "review"),
            eq(legacyFutureIntents.setupProtocolVersion, 1),
            sql`${legacyFutureIntents.setupAttemptedAt} is null`,
            sql`${legacyFutureIntents.setupSessionId} is null`,
          ),
        )
        .returning({ id: legacyFutureIntents.id });
      if (!settled) throw new BillingError("Future setup changed before cancellation");
      return { intentId, state: "canceled" as const, providerStatus: "not_started" as const };
    }
    const [customer] = await deps.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.subjectId, intent.accountId),
        ),
      );
    if (!customer && intent.setupSessionId)
      throw new BillingError("Future setup customer is unavailable");
    if (!customer) {
      const [settled] = await deps.db
        .update(legacyFutureIntents)
        .set({ state: "canceled", updatedAt: new Date() })
        .where(and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.state, "review")))
        .returning({ id: legacyFutureIntents.id });
      if (!settled) throw new BillingError("Future setup changed after cancellation");
      return { intentId, state: "canceled" as const, providerStatus: "not_created" as const };
    }
    const setup = setupInput(intent, customer.providerCustomerId, origin);
    const found = intent.setupSessionId
      ? { id: intent.setupSessionId }
      : await deps.futureProvider.findSetupSession(setup);
    if (!found) {
      if (intent.setupExpiresAt > new Date())
        return { intentId, state: "review" as const, providerStatus: "not_found" as const };
      // A setup-only session cannot charge or create a subscription; after its
      // fixed expiry, a missing session can no longer accept a payment method.
      const [settled] = await deps.db
        .update(legacyFutureIntents)
        .set({ state: "canceled", updatedAt: new Date() })
        .where(and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.state, "review")))
        .returning({ id: legacyFutureIntents.id });
      if (!settled) throw new BillingError("Future setup changed after expiration");
      return { intentId, state: "canceled" as const, providerStatus: "expired_unfound" as const };
    }
    const remote = await deps.futureProvider.expireSetup(setup, found.id);
    if (remote.status !== "expired" && remote.status !== "complete")
      throw new BillingError("Future setup cancellation is not confirmed");
    const [settled] = await deps.db
      .update(legacyFutureIntents)
      .set({ state: "canceled", setupSessionId: found.id, updatedAt: new Date() })
      .where(and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.state, "review")))
      .returning({ id: legacyFutureIntents.id });
    if (!settled) throw new BillingError("Future setup changed after cancellation");
    return { intentId, state: "canceled" as const, providerStatus: remote.status };
  });
}

/** The user's cancellation is committed before provider I/O so maintenance
 * can complete it even if the browser or session disappears. */
export async function requestLegacyFutureCancellation(
  deps: {
    db: Database;
    mode: StripeMode;
    publicUrl: string;
    futureProvider: Pick<
      ReturnType<typeof createStripeFutureContractProvider>,
      "findSchedule" | "cancelSchedule" | "findSetupSession" | "expireSetup"
    >;
  },
  actorId: string,
  sessionId: string,
  raw: { intentId: string },
) {
  const { intentId } = z.object({ intentId: z.uuid() }).parse(raw);
  if (!sessionId) throw new BillingError("Recent central authentication is required");
  const [observed] = await deps.db
    .select()
    .from(legacyFutureIntents)
    .where(and(eq(legacyFutureIntents.id, intentId), eq(legacyFutureIntents.payerUserId, actorId)));
  if (!observed) throw new BillingError("Future contract is unavailable");
  const outcome = await withActiveCompassoBillingLock(deps.db, actorId, observed.accountId, () =>
    deps.db.transaction(async (tx) => {
      const { account } = await assertAccountPayer(tx, actorId, observed.accountId);
      if (account.collection !== "compasso")
        throw new BillingError("Future contract account is unavailable");
      if (!(await lockRecentCentralAuthentication(tx, actorId, sessionId)))
        throw new BillingError("Recent central authentication is required");
      const [intent] = await tx
        .select()
        .from(legacyFutureIntents)
        .where(
          and(
            eq(legacyFutureIntents.id, intentId),
            eq(legacyFutureIntents.accountId, account.id),
            eq(legacyFutureIntents.payerUserId, actorId),
          ),
        )
        .for("update");
      if (intent?.state === "canceled") return "canceled" as const;
      if (intent?.state === "setup_ready") {
        if (intent.scheduleId) throw new BillingError("Future schedule requires reconciliation");
        await tx
          .update(legacyFutureIntents)
          .set({ state: "canceled", cancelRequestedAt: new Date(), updatedAt: new Date() })
          .where(eq(legacyFutureIntents.id, intentId));
        return "canceled" as const;
      }
      if (
        intent?.state === "setup_pending" ||
        (intent?.state === "review" && !intent.paymentMethodId && !intent.scheduleId)
      ) {
        await tx
          .update(legacyFutureIntents)
          .set({
            state: "review",
            cancelRequestedAt: intent.cancelRequestedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(legacyFutureIntents.id, intentId));
        return "setup" as const;
      }
      if (
        !intent ||
        !intent.paymentMethodId ||
        !(
          intent.state === "scheduled" ||
          intent.state === "scheduling" ||
          intent.state === "review"
        )
      )
        throw new BillingError("Future schedule cannot be canceled through this operation");
      await tx
        .update(legacyFutureIntents)
        .set({
          state: "review",
          cancelRequestedAt: intent.cancelRequestedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(legacyFutureIntents.id, intentId));
      return "pending" as const;
    }),
  );
  if (outcome === "canceled") return { intentId, state: "canceled" as const };
  if (outcome === "setup") return cancelUnsettledLegacyFutureSetup(deps, { intentId });
  return cancelUnsettledLegacyFutureIntent(deps, { intentId });
}
