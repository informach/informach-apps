import { createHash } from "node:crypto";
import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import { and, asc, type Database, eq, gt, inArray, sql } from "@informach/db";
import {
  collectionAccounts,
  collectionClosureReceipts,
  creditReservations,
  customers,
  familyGroups,
  legacyBillingCoordinations,
  legacyFutureIntents,
} from "@informach/db/schema";
import { activePersonalWebReservations, personalWebCustomerCondition } from "./personal-scope";

/** A coordination in one of these states still binds the payer's billing. */
export const ACTIVE_BILLING_COORDINATION_STATES: readonly string[] = [
  "open",
  "payer_accepted",
  "applying",
  "applied",
  "review",
];

export type BillingClosureTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type FrozenBillingActor = Parameters<typeof lockFrozenWebParticipation>[1];
export class BillingClosureError extends Error {
  constructor(readonly code: "scope_changed" | "pending_operations" | "financial_review") {
    super(`Billing closure: ${code}`);
    this.name = "BillingClosureError";
  }
}
const PAGE_SIZE = 100;
async function pages<T extends { id: string }>(read: (after?: string) => Promise<T[]>) {
  const rows: T[] = [];
  const deadline = performance.now() + 45_000;
  let after: string | undefined;
  while (true) {
    if (performance.now() > deadline) throw new BillingClosureError("pending_operations");
    const page = await read(after);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    after = page.at(-1)?.id;
    if (!after) throw new BillingClosureError("scope_changed");
  }
}

export async function lockBillingClosureScope(
  tx: BillingClosureTransaction,
  actor: FrozenBillingActor,
) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const accounts = () =>
    pages((after) =>
      tx
        .select({
          id: collectionAccounts.id,
          groupId: collectionAccounts.groupId,
          payerUserId: collectionAccounts.payerUserId,
        })
        .from(collectionAccounts)
        .where(
          and(
            eq(collectionAccounts.collection, "compasso"),
            eq(collectionAccounts.payerUserId, actor.userId),
            after ? gt(collectionAccounts.id, after) : undefined,
          ),
        )
        .orderBy(asc(collectionAccounts.id))
        .limit(PAGE_SIZE),
    );
  const observed = await accounts();
  const groups = [...new Set(observed.map((a) => a.groupId))].sort();
  for (let start = 0; start < groups.length; start += PAGE_SIZE)
    await tx
      .select({ id: familyGroups.id })
      .from(familyGroups)
      .where(inArray(familyGroups.id, groups.slice(start, start + PAGE_SIZE)))
      .orderBy(familyGroups.id)
      .for("update");
  await lockFrozenWebParticipation(tx, actor);
  const ownedAccounts = await accounts();
  if (JSON.stringify(observed) !== JSON.stringify(ownedAccounts))
    throw new BillingClosureError("scope_changed");
  const ownedCustomers = await pages((after) =>
    tx
      .select({
        id: customers.id,
        app: customers.app,
        provider: customers.provider,
        providerCustomerId: customers.providerCustomerId,
        subjectType: customers.subjectType,
        subjectId: customers.subjectId,
      })
      .from(customers)
      .where(
        and(
          personalWebCustomerCondition(actor.userId),
          after ? gt(customers.id, after) : undefined,
        ),
      )
      .orderBy(customers.id)
      .limit(PAGE_SIZE),
  );
  const ownCustomerIds = tx
    .select({ id: customers.id })
    .from(customers)
    .where(personalWebCustomerCondition(actor.userId));
  // The consented selection remains stable while the executor advances a
  // receipt through review/canceled. Never fingerprint mutable provider state.
  const futureIntents = await pages((after) =>
    tx
      .select({
        id: legacyFutureIntents.id,
        accountId: legacyFutureIntents.accountId,
        payerUserId: legacyFutureIntents.payerUserId,
        termsRevision: legacyFutureIntents.termsRevision,
        state: legacyFutureIntents.state,
      })
      .from(legacyFutureIntents)
      .where(
        and(
          eq(legacyFutureIntents.payerUserId, actor.userId),
          after ? gt(legacyFutureIntents.id, after) : undefined,
        ),
      )
      .orderBy(asc(legacyFutureIntents.id))
      .limit(PAGE_SIZE),
  );
  // Only the coordinations this actor answers as payer: closing the adult who
  // merely contributed a contract never changes someone else's billing.
  const coordinations = await pages((after) =>
    tx
      .select({
        id: legacyBillingCoordinations.id,
        accountId: legacyBillingCoordinations.accountId,
        payerUserId: legacyBillingCoordinations.payerUserId,
        state: legacyBillingCoordinations.state,
      })
      .from(legacyBillingCoordinations)
      .where(
        and(
          eq(legacyBillingCoordinations.payerUserId, actor.userId),
          after ? gt(legacyBillingCoordinations.id, after) : undefined,
        ),
      )
      .orderBy(asc(legacyBillingCoordinations.id))
      .limit(PAGE_SIZE),
  );
  const [facts] = await tx.execute<{
    reservations: boolean;
    legacyPending: boolean;
    retained: number;
  }>(sql`select
    exists (select 1 from ${creditReservations} where ${activePersonalWebReservations(actor.userId)}) as reservations,
    (exists (select 1 from billing.subscriptions s join ${customers} on ${customers.id} = s.customer_id
      where ${personalWebCustomerCondition(actor.userId)} and ${customers.app} <> 'compasso' and
       (s.status not in ('canceled', 'incomplete_expired') or s.pending_product_id is not null or s.pending_price_id is not null))
     or exists (select 1 from billing.checkout_intents c join ${customers} on ${customers.id} = c.customer_id where ${personalWebCustomerCondition(actor.userId)} and ${customers.app} <> 'compasso'
       and not exists (select 1 from billing.legacy_checkout_resolutions r where r.provider_session_id = c.provider_session_id and r.customer_id = c.customer_id))
     or exists (select 1 from billing.one_time_payments p join ${customers} on ${customers.id} = p.customer_id where ${personalWebCustomerCondition(actor.userId)} and ${customers.app} <> 'compasso' and p.status = 'pending')
     or exists (select 1 from billing.legacy_payment_evidence_reviews r join billing.subscriptions s on s.id = r.subscription_id
       join ${customers} on ${customers.id} = s.customer_id where ${personalWebCustomerCondition(actor.userId)} and r.resolved_at is null)
     or exists (select 1 from billing.legacy_contract_acceptances a where a.payer_user_id = ${actor.userId} and a.cancellation_confirmed_at is null)) as "legacyPending",
    ((select count(*) from billing.subscriptions where customer_id in (${ownCustomerIds})) +
     (select count(*) from billing.one_time_payments where customer_id in (${ownCustomerIds})) +
     (select count(*) from billing.legacy_contract_acceptances where payer_user_id = ${actor.userId}) +
     (select count(*) from billing.legacy_contract_acceptance_periods p join billing.legacy_contract_acceptances a on a.id = p.acceptance_id where a.payer_user_id = ${actor.userId}) +
     (select count(*) from billing.legacy_payment_evidence_reviews r join billing.subscriptions s on s.id = r.subscription_id where s.customer_id in (${ownCustomerIds})) +
     (select count(*) from billing.legacy_future_intents where payer_user_id = ${actor.userId}) +
     (select count(*) from billing.legacy_billing_coordinations where payer_user_id = ${actor.userId} or contributor_user_id = ${actor.userId}) +
     (select count(*) from billing.legacy_billing_consents where user_id = ${actor.userId}))::integer as retained`);
  if (!facts) throw new BillingClosureError("financial_review");
  const compasso = ownedCustomers.filter((c) => c.app === "compasso");
  const unsupported =
    compasso.some((c) => c.provider !== "stripe" || c.subjectType !== "billing_account") ||
    futureIntents.some(
      (intent) =>
        intent.state === "failed" ||
        !ownedAccounts.some((account) => account.id === intent.accountId),
    );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        "billing-closure-v1",
        actor.userId,
        actor.operationId,
        actor.expectedRevision,
        ownedAccounts,
        ownedCustomers,
        futureIntents.map(({ state: _state, ...intent }) => intent),
        // Appended only when present, so selections prepared before this
        // record existed keep the fingerprint they consented to.
        ...(coordinations.length ? [coordinations.map(({ state: _state, ...item }) => item)] : []),
      ]),
    )
    .digest("hex");
  return {
    accounts: ownedAccounts,
    customers: compasso,
    futureIntents,
    coordinations,
    fingerprint,
    retainedRecords: facts.retained + ownedCustomers.length + ownedAccounts.length,
    pendingOperations: facts.reservations,
    financialReview: unsupported || facts.legacyPending,
  };
}

export async function assertBillingClosureScope(
  tx: BillingClosureTransaction,
  actor: FrozenBillingActor,
  fingerprint: string,
) {
  const scope = await lockBillingClosureScope(tx, actor);
  if (scope.fingerprint !== fingerprint) throw new BillingClosureError("scope_changed");
  if (scope.financialReview) throw new BillingClosureError("financial_review");
  if (scope.pendingOperations) throw new BillingClosureError("pending_operations");
  return scope;
}

/** Called with the account lifecycle lock held, or during the frozen final check.
 * Expiry and cached subscription status alone never settle a pending purchase. */
export async function hasUnsettledClosureCustomer(
  tx: BillingClosureTransaction,
  customerId: string,
) {
  const [row] = await tx.execute<{ pending: boolean }>(sql`select (
    exists (select 1 from billing.checkout_intents where customer_id = ${customerId}) or
    exists (select 1 from billing.credit_purchase_intents where customer_id = ${customerId} and outcome = 'pending') or
    exists (select 1 from billing.one_time_payments where customer_id = ${customerId} and status = 'pending') or
    exists (select 1 from billing.subscriptions where customer_id = ${customerId} and
      (status not in ('canceled', 'incomplete_expired') or pending_product_id is not null or pending_price_id is not null)) or
    exists (select 1 from billing.collection_plan_changes p join billing.subscriptions s on s.id = p.subscription_id where s.customer_id = ${customerId} and p.status in ('preparing', 'scheduled'))
  ) as pending`);
  if (!row) throw new BillingClosureError("financial_review");
  return row.pending;
}

export async function hasBillingClosureReceipt(
  tx: BillingClosureTransaction,
  actor: FrozenBillingActor,
  customerId: string,
  fingerprint: string,
) {
  const [receipt] = await tx
    .select({ customerId: collectionClosureReceipts.customerId })
    .from(collectionClosureReceipts)
    .where(
      and(
        eq(collectionClosureReceipts.operationId, actor.operationId),
        eq(collectionClosureReceipts.customerId, customerId),
        eq(collectionClosureReceipts.actorId, actor.userId),
        eq(collectionClosureReceipts.frozenRevision, actor.expectedRevision),
        eq(collectionClosureReceipts.scopeFingerprint, fingerprint),
      ),
    );
  return !!receipt && !(await hasUnsettledClosureCustomer(tx, customerId));
}

/** The coordinator records its own completion in this same transaction. No
 * ledger, paid period, customer, payment or subscription history is deleted. */
export async function commitBillingClosure(
  tx: BillingClosureTransaction,
  actor: FrozenBillingActor,
  fingerprint: string,
) {
  const scope = await assertBillingClosureScope(tx, actor, fingerprint);
  if (
    scope.futureIntents.some((intent) =>
      ["setup_pending", "setup_ready", "scheduling", "scheduled", "review"].includes(intent.state),
    )
  )
    throw new BillingClosureError("pending_operations");
  if (scope.coordinations.some((item) => ACTIVE_BILLING_COORDINATION_STATES.includes(item.state)))
    throw new BillingClosureError("pending_operations");
  for (const customer of scope.customers)
    if (!(await hasBillingClosureReceipt(tx, actor, customer.id, fingerprint)))
      throw new BillingClosureError("pending_operations");
  for (let start = 0; start < scope.accounts.length; start += PAGE_SIZE)
    await tx
      .update(collectionAccounts)
      .set({ closedAt: sql`coalesce(${collectionAccounts.closedAt}, clock_timestamp())` })
      .where(
        inArray(
          collectionAccounts.id,
          scope.accounts.slice(start, start + PAGE_SIZE).map((a) => a.id),
        ),
      );
}
