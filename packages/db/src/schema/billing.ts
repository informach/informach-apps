import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { familyGroups } from "./family";

export const billing = pgSchema("billing");

export const ownerTypeEnum = billing.enum("owner_type", [
  "user",
  "organization",
  "family",
  "billing_account",
]);

export const billingProviderEnum = billing.enum("billing_provider", ["stripe", "asaas"]);

export const subscriptionStatusEnum = billing.enum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export const paymentStatusEnum = billing.enum("payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);

export const ledgerEntryTypeEnum = billing.enum("ledger_entry_type", [
  "purchase",
  "bonus_grant",
  "promo_grant",
  "consumption",
  "refund",
  "expiration",
  "adjustment",
  "funding_suspension",
  "funding_restoration",
]);

export const reservationStatusEnum = billing.enum("reservation_status", [
  "active",
  "committed",
  "released",
  "expired",
]);

/** Immutable payer mandate. Replacing the payer creates a new account/customer,
 * never transfers stored payment methods or erases the beneficiary's wallet. */
export const collectionAccounts = billing.table(
  "collection_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collection: text("collection").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    payerUserId: text("payer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collection_account_active_group")
      .on(t.groupId, t.collection)
      .where(sql`${t.closedAt} is null`),
    index("collection_account_payer").on(t.payerUserId, t.collection),
  ],
);

export const collectionTrials = billing.table(
  "collection_trials",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    collection: text("collection").notNull(),
    startedBy: text("started_by").references(() => users.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.collection] }),
    uniqueIndex("collection_trial_actor_uniq")
      .on(t.collection, t.startedBy)
      .where(sql`${t.startedBy} is not null`),
    check("collection_trial_window", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/** Durable keyed digest, deliberately not cascading with account deletion. */
export const collectionTrialClaims = billing.table(
  "collection_trial_claims",
  {
    collection: text("collection").notNull(),
    emailHash: text("email_hash").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collection, t.emailHash] })],
);

export const customers = billing.table(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billingProviderEnum("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    subjectType: ownerTypeEnum("subject_type")
      .$type<"user" | "organization" | "billing_account">()
      .notNull(),
    subjectId: text("subject_id").notNull(),
    // App-scope para isolar customers entre apps que compartilham o mesmo
    // subject (ex.: mesmo user em Cozya e Agenda da Turma → 2 customers
    // distintos no Stripe). UNIQUE composto inclui app por isso.
    app: text("app").notNull(),
    email: text("email").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "customers_subject_kind",
      sql`${t.subjectType}::text in ('user', 'organization', 'billing_account')`,
    ),
    uniqueIndex("customers_provider_subject_app_uniq").on(
      t.provider,
      t.subjectType,
      t.subjectId,
      t.app,
    ),
    uniqueIndex("customers_provider_provider_id_uniq").on(t.provider, t.providerCustomerId),
    index("customers_subject_app_idx").on(t.subjectType, t.subjectId, t.app),
  ],
);

// One durable checkout attempt per customer. RESTRICT also closes the race with
// deletion of the shared account in another app before a subscription webhook.
export const checkoutIntents = billing.table("checkout_intents", {
  customerId: uuid("customer_id")
    .primaryKey()
    .references(() => customers.id, { onDelete: "restrict" }),
  id: uuid("id").notNull().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  productId: text("product_id").notNull(),
  request: jsonb("request")
    .$type<{
      priceId: string;
      successUrl: string;
      cancelUrl: string;
      trialDays?: number;
      expiresAt: number;
    }>()
    .notNull(),
  requestStarted: boolean("request_started").notNull().default(false),
  providerSessionId: text("provider_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = billing.table(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    provider: billingProviderEnum("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    productId: text("product_id").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: timestamp("cancel_at_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    // Positive, durable commercial milestone. It remains set after a later
    // cancellation and is never inferred from a terminal status alone.
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    providerObservedAt: timestamp("provider_observed_at", { withTimezone: true }),
    // Queue progress only: a failed provider read must not refresh payment facts.
    legacyFundingAttemptedAt: timestamp("legacy_funding_attempted_at", { withTimezone: true }),
    trialEnd: timestamp("trial_end", { withTimezone: true }),
    // Drip mensal de créditos no plano anual: o sweeper diário concede o bônus
    // quando next_credit_grant_at <= now() e a subscription ainda está ativa.
    // NULL para planos mensais (que recebem grant via invoice.paid) e para Free.
    nextCreditGrantAt: timestamp("next_credit_grant_at", { withTimezone: true }),
    // Intent: produto/preço Stripe que deve substituir esta sub no fim do período
    // (downgrade agendado). Aplicado pelo handler de customer.subscription.deleted.
    pendingProductId: text("pending_product_id"),
    pendingPriceId: text("pending_price_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_id_uniq").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_customer_status_idx").on(t.customerId, t.status),
    index("subscriptions_period_end_idx").on(t.currentPeriodEnd),
    index("subscriptions_legacy_funding_attempt_idx").on(t.legacyFundingAttemptedAt, t.id),
    index("subscriptions_next_grant_idx")
      .on(t.nextCreditGrantAt)
      .where(sql`${t.nextCreditGrantAt} IS NOT NULL`),
  ],
);

// Compasso changes the price on the same Stripe subscription at the paid boundary.
// These receipts are independent of the legacy cancel/recreate pending_* fields.
export const collectionPlanChanges = billing.table(
  "collection_plan_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestKey: uuid("request_key").notNull(),
    fromPriceId: text("from_price_id").notNull(),
    toPriceId: text("to_price_id").notNull(),
    toProductId: text("to_product_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<"preparing" | "scheduled" | "applied" | "canceled" | "failed">()
      .notNull()
      .default("preparing"),
    providerScheduleId: text("provider_schedule_id"),
    requestStartedAt: timestamp("request_started_at", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("collection_plan_changes_request_uniq").on(t.subscriptionId, t.requestKey),
    uniqueIndex("collection_plan_changes_pending_uniq")
      .on(t.subscriptionId)
      .where(sql`${t.status} IN ('preparing', 'scheduled')`),
    uniqueIndex("collection_plan_changes_schedule_uniq")
      .on(t.providerScheduleId)
      .where(sql`${t.providerScheduleId} IS NOT NULL`),
    check(
      "collection_plan_changes_status_chk",
      sql`${t.status} IN ('preparing', 'scheduled', 'applied', 'canceled', 'failed')`,
    ),
    check("collection_plan_changes_prices_chk", sql`${t.fromPriceId} <> ${t.toPriceId}`),
    check(
      "collection_plan_changes_resolution_chk",
      sql`(${t.resolvedAt} IS NOT NULL) = (${t.status} IN ('applied', 'canceled', 'failed'))`,
    ),
    check(
      "collection_plan_changes_provider_chk",
      sql`${t.providerScheduleId} IS NULL OR ${t.requestStartedAt} IS NOT NULL`,
    ),
  ],
);

// A paid zero-value invoice is valid (coupon/credit); refunds and disputes are
// reconciled against this exact invoice, never against an unrelated renewal.
export const subscriptionPaymentPeriods = billing.table(
  "subscription_payment_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    provider: billingProviderEnum("provider").notNull(),
    providerInvoiceId: text("provider_invoice_id").notNull(),
    providerLineId: text("provider_line_id").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    fullyRefunded: boolean("fully_refunded").notNull().default(false),
    disputed: boolean("disputed").notNull().default(false),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_payment_period_line_uniq").on(
      t.provider,
      t.providerInvoiceId,
      t.providerLineId,
    ),
    index("subscription_payment_period_subscription_idx").on(t.subscriptionId, t.periodEnd),
    index("subscription_payment_period_invoice_idx").on(t.provider, t.providerInvoiceId),
    check("subscription_payment_period_range_chk", sql`${t.periodEnd} > ${t.periodStart}`),
  ],
);

/** Explicit payer acceptance binds one historical contract to one family.
 * The periods covered by the acceptance are recorded separately. */
export const legacyContractAcceptances = billing.table(
  "legacy_contract_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    payerUserId: text("payer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    policyVersion: text("policy_version").notNull(),
    acceptedRevision: text("accepted_revision"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    cancellationConfirmedAt: timestamp("cancellation_confirmed_at", { withTimezone: true }),
    cancellationLeaseToken: uuid("cancellation_lease_token"),
    cancellationLeaseUntil: timestamp("cancellation_lease_until", { withTimezone: true }),
    cancellationAttemptedAt: timestamp("cancellation_attempted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("legacy_contract_acceptance_subscription_uniq").on(t.subscriptionId),
    index("legacy_contract_acceptance_group_idx").on(t.groupId),
    index("legacy_contract_acceptance_pending_idx")
      .on(t.cancellationAttemptedAt)
      .where(sql`${t.cancellationConfirmedAt} is null`),
    check(
      "legacy_contract_acceptance_lease_pair",
      sql`(${t.cancellationLeaseToken} is null) = (${t.cancellationLeaseUntil} is null)`,
    ),
    check(
      "legacy_contract_acceptance_revision_format",
      sql`${t.acceptedRevision} is null or ${t.acceptedRevision} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/** Fixed consent scope: future renewal invoices cannot silently extend access. */
export const legacyContractAcceptancePeriods = billing.table(
  "legacy_contract_acceptance_periods",
  {
    acceptanceId: uuid("acceptance_id")
      .notNull()
      .references(() => legacyContractAcceptances.id, { onDelete: "restrict" }),
    paymentPeriodId: uuid("payment_period_id")
      .notNull()
      .references(() => subscriptionPaymentPeriods.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.acceptanceId, t.paymentPeriodId] }),
    uniqueIndex("legacy_contract_acceptance_period_uniq").on(t.paymentPeriodId),
  ],
);

/** Provider lifecycle facts observed together with the paid-period reconciliation. */
export const legacyContractObservations = billing.table(
  "legacy_contract_observations",
  {
    subscriptionId: uuid("subscription_id")
      .primaryKey()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    refreshAttemptedAt: timestamp("refresh_attempted_at", { withTimezone: true }),
  },
  (t) => [index("legacy_contract_observation_attempt_idx").on(t.refreshAttemptedAt)],
);

/** A provider observation contradicted a previously stored payment period.
 * Retained after resolution; timestamps are not provider payment facts. */
export const legacyPaymentEvidenceReviews = billing.table(
  "legacy_payment_evidence_reviews",
  {
    subscriptionId: uuid("subscription_id")
      .primaryKey()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "legacy_payment_evidence_review_order",
      sql`${t.resolvedAt} is null or ${t.resolvedAt} >= ${t.detectedAt}`,
    ),
  ],
);

/** Immutable terms and resumable provider references for the post-cutover plan. */
export const legacyFutureIntents = billing.table(
  "legacy_future_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => collectionAccounts.id, { onDelete: "restrict" }),
    payerUserId: text("payer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestKey: uuid("request_key").notNull(),
    productId: text("product_id").notNull(),
    providerPriceId: text("provider_price_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    interval: text("interval").notNull(),
    paidThrough: timestamp("paid_through", { withTimezone: true }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    termsRevision: text("terms_revision").notNull(),
    setupExpiresAt: timestamp("setup_expires_at", { withTimezone: true }).notNull(),
    setupProtocolVersion: integer("setup_protocol_version").notNull().default(0),
    setupAttemptedAt: timestamp("setup_attempted_at", { withTimezone: true }),
    scheduleProtocolVersion: integer("schedule_protocol_version").notNull().default(0),
    scheduleAttemptedAt: timestamp("schedule_attempted_at", { withTimezone: true }),
    state: text("state").notNull().default("setup_pending"),
    setupSessionId: text("setup_session_id"),
    paymentMethodId: text("payment_method_id"),
    scheduleId: text("schedule_id"),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("legacy_future_intent_request_uniq").on(t.payerUserId, t.requestKey),
    uniqueIndex("legacy_future_intent_setup_uniq")
      .on(t.setupSessionId)
      .where(sql`${t.setupSessionId} is not null`),
    uniqueIndex("legacy_future_intent_schedule_uniq")
      .on(t.scheduleId)
      .where(sql`${t.scheduleId} is not null`),
    uniqueIndex("legacy_future_intent_active_account")
      .on(t.accountId)
      .where(
        sql`${t.state} in ('setup_pending', 'setup_ready', 'scheduling', 'scheduled', 'review')`,
      ),
    check(
      "legacy_future_intent_state",
      sql`${t.state} in ('setup_pending', 'setup_ready', 'scheduling', 'scheduled', 'review', 'applied', 'canceled', 'failed')`,
    ),
    check("legacy_future_intent_interval", sql`${t.interval} in ('month', 'year')`),
    check("legacy_future_intent_setup_protocol", sql`${t.setupProtocolVersion} in (0, 1)`),
    check("legacy_future_intent_schedule_protocol", sql`${t.scheduleProtocolVersion} in (0, 1)`),
    check("legacy_future_intent_amount", sql`${t.amountCents} > 0`),
    check("legacy_future_intent_start", sql`${t.startsAt} >= ${t.paidThrough}`),
    check("legacy_future_intent_revision", sql`${t.termsRevision} ~ '^[0-9a-f]{64}$'`),
    check(
      "legacy_future_intent_method",
      sql`${t.state} not in ('setup_ready', 'scheduling', 'scheduled', 'applied') or (${t.setupSessionId} is not null and ${t.paymentMethodId} is not null)`,
    ),
    check(
      "legacy_future_intent_schedule",
      sql`${t.state} not in ('scheduled', 'applied') or ${t.scheduleId} is not null`,
    ),
  ],
);

/** One adult brought a historical contract to a family whose payer already has
 * a Compasso commitment. The contributor's own receipt stays in
 * `legacy_contract_acceptances`; this row carries only what the payer must
 * approve: moving the payer's own next charge to the contributed paid-through
 * date. The attempt is recorded before the provider is called. */
export const legacyBillingCoordinations = billing.table(
  "legacy_billing_coordinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => collectionAccounts.id, { onDelete: "restrict" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    payerUserId: text("payer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    contributorUserId: text("contributor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    policyVersion: text("policy_version").notNull(),
    state: text("state").notNull().default("open"),
    kind: text("kind"),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "restrict",
    }),
    futureIntentId: uuid("future_intent_id").references(() => legacyFutureIntents.id, {
      onDelete: "restrict",
    }),
    providerPriceId: text("provider_price_id"),
    amountCents: integer("amount_cents"),
    interval: text("interval"),
    fromChargeAt: timestamp("from_charge_at", { withTimezone: true }),
    contributedPaidThrough: timestamp("contributed_paid_through", { withTimezone: true }),
    deferUntil: timestamp("defer_until", { withTimezone: true }),
    offerRevision: text("offer_revision"),
    effectProtocolVersion: integer("effect_protocol_version").notNull().default(1),
    effectAttemptedAt: timestamp("effect_attempted_at", { withTimezone: true }),
    effectConfirmedAt: timestamp("effect_confirmed_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("legacy_billing_coordination_active_account")
      .on(t.accountId)
      .where(sql`${t.state} in ('open', 'payer_accepted', 'applying', 'applied', 'review')`),
    index("legacy_billing_coordination_group_idx").on(t.groupId),
    index("legacy_billing_coordination_payer_idx").on(t.payerUserId),
    index("legacy_billing_coordination_contributor_idx").on(t.contributorUserId),
    index("legacy_billing_coordination_recovery_idx")
      .on(t.updatedAt)
      .where(sql`${t.state} in ('open', 'payer_accepted', 'applying', 'applied', 'review')`),
    check(
      "legacy_billing_coordination_state",
      sql`${t.state} in ('open', 'payer_accepted', 'applying', 'applied', 'review', 'settled', 'no_effect', 'declined', 'lapsed', 'invalidated', 'canceled')`,
    ),
    check(
      "legacy_billing_coordination_kind",
      sql`(${t.kind} is null and ${t.subscriptionId} is null and ${t.futureIntentId} is null) or (${t.kind} = 'subscription_trial' and ${t.subscriptionId} is not null and ${t.futureIntentId} is null) or (${t.kind} = 'schedule_start' and ${t.futureIntentId} is not null and ${t.subscriptionId} is null)`,
    ),
    check(
      "legacy_billing_coordination_offer",
      sql`${t.state} not in ('payer_accepted', 'applying', 'applied', 'settled') or (${t.kind} is not null and ${t.providerPriceId} is not null and ${t.amountCents} is not null and ${t.interval} is not null and ${t.fromChargeAt} is not null and ${t.contributedPaidThrough} is not null and ${t.deferUntil} is not null and ${t.offerRevision} is not null)`,
    ),
    check(
      "legacy_billing_coordination_attempt",
      sql`${t.state} not in ('applying', 'applied', 'settled') or ${t.effectAttemptedAt} is not null`,
    ),
    check(
      "legacy_billing_coordination_confirmation",
      sql`${t.state} not in ('applied', 'settled') or ${t.effectConfirmedAt} is not null`,
    ),
    check(
      "legacy_billing_coordination_settlement",
      sql`${t.state} <> 'settled' or ${t.settledAt} is not null`,
    ),
    check(
      "legacy_billing_coordination_dates",
      sql`${t.deferUntil} is null or (${t.deferUntil} > ${t.fromChargeAt} and ${t.deferUntil} >= ${t.contributedPaidThrough})`,
    ),
    check(
      "legacy_billing_coordination_amount",
      sql`${t.amountCents} is null or ${t.amountCents} > 0`,
    ),
    check(
      "legacy_billing_coordination_interval",
      sql`${t.interval} is null or ${t.interval} in ('month', 'year')`,
    ),
    check("legacy_billing_coordination_protocol", sql`${t.effectProtocolVersion} in (1)`),
    check(
      "legacy_billing_coordination_revision",
      sql`${t.offerRevision} is null or ${t.offerRevision} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/** Historical contracts whose accepted paid periods feed one coordination. */
export const legacyBillingCoordinationContracts = billing.table(
  "legacy_billing_coordination_contracts",
  {
    coordinationId: uuid("coordination_id")
      .notNull()
      .references(() => legacyBillingCoordinations.id, { onDelete: "restrict" }),
    acceptanceId: uuid("acceptance_id")
      .notNull()
      .references(() => legacyContractAcceptances.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.coordinationId, t.acceptanceId] }),
    index("legacy_billing_coordination_contract_acceptance_idx").on(t.acceptanceId),
  ],
);

/** Insert-only receipts. Each row is what one person saw and decided; `terms`
 * holds only the facts shown to that person, never the other payer's. */
export const legacyBillingConsents = billing.table(
  "legacy_billing_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    decision: text("decision").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    coordinationId: uuid("coordination_id")
      .notNull()
      .references(() => legacyBillingCoordinations.id, { onDelete: "restrict" }),
    acceptanceId: uuid("acceptance_id").references(() => legacyContractAcceptances.id, {
      onDelete: "restrict",
    }),
    policyVersion: text("policy_version").notNull(),
    termsRevision: text("terms_revision").notNull(),
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull(),
    requestKey: uuid("request_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("legacy_billing_consent_request_uniq").on(t.userId, t.requestKey),
    uniqueIndex("legacy_billing_consent_payer_decision_uniq")
      .on(t.coordinationId, t.decision, t.termsRevision)
      .where(sql`${t.role} = 'payer'`),
    uniqueIndex("legacy_billing_consent_contributor_uniq")
      .on(t.coordinationId, t.acceptanceId)
      .where(sql`${t.role} = 'contributor'`),
    index("legacy_billing_consent_user_idx").on(t.userId, t.createdAt),
    check("legacy_billing_consent_role", sql`${t.role} in ('contributor', 'payer')`),
    check(
      "legacy_billing_consent_decision",
      sql`${t.decision} in ('accepted', 'declined', 'resumed')`,
    ),
    check(
      "legacy_billing_consent_contributor_scope",
      sql`(${t.role} = 'contributor') = (${t.acceptanceId} is not null)`,
    ),
    check(
      "legacy_billing_consent_contributor_decision",
      sql`${t.role} <> 'contributor' or ${t.decision} = 'accepted'`,
    ),
    check("legacy_billing_consent_revision", sql`${t.termsRevision} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const oneTimePayments = billing.table(
  "one_time_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    provider: billingProviderEnum("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    productId: text("product_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    status: paymentStatusEnum("status").notNull(),
    creditAmount: integer("credit_amount"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("one_time_payments_provider_id_uniq").on(t.provider, t.providerPaymentId),
    index("one_time_payments_customer_status_idx").on(t.customerId, t.status),
  ],
);

/** Durable payment checkout and immutable commercial receipt. Kept after fulfillment. */
export const creditPurchaseIntents = billing.table(
  "credit_purchase_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requestKey: uuid("request_key").notNull(),
    productId: text("product_id").notNull(),
    priceId: text("price_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    credits: integer("credits").notNull(),
    request: jsonb("request")
      .$type<{ successUrl: string; cancelUrl: string; expiresAt: number }>()
      .notNull(),
    requestStarted: boolean("request_started").notNull().default(false),
    providerSessionId: text("provider_session_id"),
    outcome: text("outcome")
      .$type<"pending" | "paid" | "expired" | "failed">()
      .notNull()
      .default("pending"),
    paymentId: uuid("payment_id").references(() => oneTimePayments.id, { onDelete: "restrict" }),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    revokedCredits: integer("revoked_credits").notNull().default(0),
    disputed: boolean("disputed").notNull().default(false),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_purchase_request_uniq").on(t.customerId, t.requestKey),
    uniqueIndex("credit_purchase_pending_uniq")
      .on(t.customerId)
      .where(sql`${t.outcome} = 'pending'`),
    uniqueIndex("credit_purchase_session_uniq")
      .on(t.providerSessionId)
      .where(sql`${t.providerSessionId} is not null`),
    uniqueIndex("credit_purchase_payment_uniq")
      .on(t.paymentId)
      .where(sql`${t.paymentId} is not null`),
    check(
      "credit_purchase_amounts",
      sql`${t.amountCents} > 0 and ${t.credits} > 0 and ${t.refundedAmountCents} between 0 and ${t.amountCents} and ${t.revokedCredits} between 0 and ${t.credits}`,
    ),
    check(
      "credit_purchase_outcome",
      sql`${t.outcome} in ('pending', 'paid', 'expired', 'failed') and ((${t.outcome} = 'pending') = (${t.resolvedAt} is null)) and ((${t.outcome} = 'paid') = (${t.paymentId} is not null))`,
    ),
    index("credit_purchase_customer_created_idx").on(t.customerId, t.createdAt),
  ],
);

export const creditPricing = billing.table(
  "credit_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    promptCostPer1k: integer("prompt_cost_per_1k").notNull().default(0),
    completionCostPer1k: integer("completion_cost_per_1k").notNull().default(0),
    flatCost: integer("flat_cost").notNull().default(0),
    defaultEstimateCredits: integer("default_estimate_credits").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [
    index("credit_pricing_feature_model_effective_idx").on(t.feature, t.model, t.effectiveFrom),
    uniqueIndex("credit_pricing_active_uniq")
      .on(t.feature, t.model)
      .where(sql`${t.effectiveTo} IS NULL`),
  ],
);

export const creditReservations = billing.table(
  "credit_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: ownerTypeEnum("owner_type").$type<"user" | "organization" | "family">().notNull(),
    ownerId: text("owner_id").notNull(),
    estimatedAmount: integer("estimated_amount").notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    app: text("app").notNull(),
    /** Consumer identity is separate from the wallet's commercial scope (`app`). */
    consumerApp: text("consumer_app"),
    actorUserId: text("actor_user_id"),
    personId: uuid("person_id"),
    feature: text("feature").notNull(),
    model: text("model"),
    pricingId: uuid("pricing_id").references(() => creditPricing.id, {
      onDelete: "set null",
    }),
    runId: text("run_id"),
    requestId: text("request_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [
    index("credit_reservations_owner_active_idx")
      .on(t.ownerType, t.ownerId)
      .where(sql`${t.status} = 'active'`),
    index("credit_reservations_active_expires_idx")
      .on(t.expiresAt)
      .where(sql`${t.status} = 'active'`),
    check("credit_reservations_amount_positive_chk", sql`${t.estimatedAmount} > 0`),
    check(
      "credit_reservations_owner_kind",
      sql`${t.ownerType}::text in ('user', 'organization', 'family')`,
    ),
  ],
);

export const creditLedger = billing.table(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequence: bigint("sequence", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
    ownerType: ownerTypeEnum("owner_type").$type<"user" | "organization" | "family">().notNull(),
    ownerId: text("owner_id").notNull(),
    // Commercial wallet scope: Compasso uses `compasso`; legacy and desktop keep
    // their original scope. The consuming application is recorded independently.
    app: text("app").notNull(),
    consumerApp: text("consumer_app"),
    personId: uuid("person_id"),
    /** Consumption applies at reservation time; createdAt remains the posting time. */
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    amount: integer("amount").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    reservationId: uuid("reservation_id").references(() => creditReservations.id, {
      onDelete: "set null",
    }),
    paymentId: uuid("payment_id").references(() => oneTimePayments.id, {
      onDelete: "set null",
    }),
    fundingPeriodId: uuid("funding_period_id").references(() => subscriptionPaymentPeriods.id, {
      onDelete: "restrict",
    }),
    sourceEntryId: uuid("source_entry_id").references((): AnyPgColumn => creditLedger.id, {
      onDelete: "restrict",
    }),
    stripeEventId: text("stripe_event_id"),
    runId: text("run_id"),
    productSku: text("product_sku"),
    actorUserId: text("actor_user_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("credit_ledger_owner_app_created_idx").on(t.ownerType, t.ownerId, t.app, t.createdAt),
    index("credit_ledger_owner_app_sequence_idx").on(t.ownerType, t.ownerId, t.app, t.sequence),
    index("credit_ledger_owner_app_expires_idx")
      .on(t.ownerType, t.ownerId, t.app, t.expiresAt)
      .where(sql`${t.expiresAt} IS NOT NULL`),
    uniqueIndex("credit_ledger_stripe_event_uniq").on(t.stripeEventId),
    index("credit_ledger_reservation_idx")
      .on(t.reservationId)
      .where(sql`${t.reservationId} IS NOT NULL`),
    check("credit_ledger_amount_nonzero_chk", sql`${t.amount} <> 0`),
    check(
      "credit_ledger_sequence_safe",
      sql`${t.sequence} > 0 and ${t.sequence} <= 9007199254740991`,
    ),
    check(
      "credit_ledger_funding_control",
      sql`${t.entryType}::text not in ('funding_suspension', 'funding_restoration') or (${t.sourceEntryId} is not null and ${t.sourceEntryId} <> ${t.id} and ((${t.entryType}::text = 'funding_suspension' and ${t.amount} < 0) or (${t.entryType}::text = 'funding_restoration' and ${t.amount} > 0)))`,
    ),
    index("credit_ledger_funding_period_idx")
      .on(t.fundingPeriodId)
      .where(sql`${t.fundingPeriodId} is not null`),
    index("credit_ledger_source_idx")
      .on(t.sourceEntryId)
      .where(sql`${t.sourceEntryId} is not null`),
    check(
      "credit_ledger_owner_kind",
      sql`${t.ownerType}::text in ('user', 'organization', 'family')`,
    ),
  ],
);

/** Projection checkpoint; financial transitions remain append-only ledger records. */
export const creditFundingStates = billing.table("credit_funding_states", {
  grantEntryId: uuid("grant_entry_id")
    .primaryKey()
    .references(() => creditLedger.id, { onDelete: "restrict" }),
  blocked: boolean("blocked").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
});

/** Closes a legacy spending source; its append-only financial history is retained. */
export const creditWalletMigrations = billing.table(
  "credit_wallet_migrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceApp: text("source_app").notNull(),
    sourceUserId: text("source_user_id").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    policyId: text("policy_id").notNull(),
    multiplier: integer("multiplier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("credit_wallet_migrations_source").on(t.sourceApp, t.sourceUserId),
    index("credit_wallet_migrations_group").on(t.groupId),
    check("credit_wallet_migrations_app", sql`${t.sourceApp} in ('cozya', 'agenda-da-turma')`),
    check("credit_wallet_migrations_multiplier", sql`${t.multiplier} > 0`),
  ],
);

/** One receipt per original grant/event. Zero opening lots intentionally have no new entry. */
export const creditWalletMigrationEntries = billing.table(
  "credit_wallet_migration_entries",
  {
    sourceEntryId: uuid("source_entry_id")
      .primaryKey()
      .references(() => creditLedger.id, { onDelete: "restrict" }),
    migrationId: uuid("migration_id")
      .notNull()
      .references(() => creditWalletMigrations.id, { onDelete: "restrict" }),
    destinationEntryId: uuid("destination_entry_id").references(() => creditLedger.id, {
      onDelete: "restrict",
    }),
    kind: text("kind", { enum: ["opening", "forwarded"] }).notNull(),
    sourceAmount: integer("source_amount").notNull(),
    destinationAmount: integer("destination_amount").notNull(),
  },
  (t) => [
    uniqueIndex("credit_wallet_migration_entries_destination").on(t.destinationEntryId),
    index("credit_wallet_migration_entries_receipt").on(t.migrationId),
    check("credit_wallet_migration_entries_kind", sql`${t.kind} in ('opening', 'forwarded')`),
    check(
      "credit_wallet_migration_entries_destination_amount",
      sql`(${t.destinationEntryId} is null and ${t.destinationAmount} = 0) or (${t.destinationEntryId} is not null and ${t.destinationAmount} <> 0)`,
    ),
  ],
);

/** Collection billing stores event identifiers only; provider payloads stay out of this queue. */
export const collectionBillingEvents = billing.table(
  "collection_billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collection_billing_events_provider_id_uniq").on(t.providerEventId),
    index("collection_billing_events_customer_idx").on(t.customerId, t.createdAt),
  ],
);

export const collectionBillingJobs = billing.table(
  "collection_billing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"subscription" | "credit_purchase">().notNull(),
    subjectId: uuid("subject_id").notNull(),
    requestedVersion: integer("requested_version").notNull().default(1),
    processedVersion: integer("processed_version").notNull().default(0),
    riskVersion: integer("risk_version").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    lastSucceededAt: timestamp("last_succeeded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("collection_billing_jobs_subject_uniq").on(t.kind, t.subjectId),
    index("collection_billing_jobs_due_idx").on(t.nextAttemptAt, t.id),
    index("collection_billing_jobs_customer_idx").on(t.customerId),
    check(
      "collection_billing_jobs_kind_chk",
      sql`${t.kind} IN ('subscription', 'credit_purchase')`,
    ),
    check(
      "collection_billing_jobs_version_chk",
      sql`${t.requestedVersion} >= ${t.processedVersion} AND ${t.processedVersion} >= 0 AND ${t.attempts} >= 0`,
    ),
    check(
      "collection_billing_jobs_lease_chk",
      sql`(${t.leaseToken} IS NULL) = (${t.leaseUntil} IS NULL)`,
    ),
    check(
      "collection_billing_jobs_risk_chk",
      sql`${t.riskVersion} >= 0 AND ${t.riskVersion} <= ${t.requestedVersion}`,
    ),
  ],
);

export const webhookEvents = billing.table(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billingProviderEnum("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    /** Explicit endpoint scope; null only for historical receipts. */
    app: text("app"),
    /** Resolved before accepting a legacy adverse event; the signed payload stays intact. */
    providerCustomerId: text("provider_customer_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_uniq").on(t.provider, t.providerEventId),
    index("webhook_events_processed_idx").on(t.processedAt),
    index("webhook_events_processing_idx")
      .on(t.processingStartedAt)
      .where(sql`${t.processingStartedAt} IS NOT NULL`),
    index("webhook_events_event_type_idx").on(t.eventType),
    index("webhook_events_pending_app_idx")
      .on(t.app, t.eventType)
      .where(sql`${t.processedAt} IS NULL`),
    index("webhook_events_pending_customer_idx")
      .on(t.app, t.providerCustomerId)
      .where(sql`${t.processedAt} IS NULL`),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type OneTimePayment = typeof oneTimePayments.$inferSelect;
export type NewOneTimePayment = typeof oneTimePayments.$inferInsert;
export type CreditPricingRow = typeof creditPricing.$inferSelect;
export type NewCreditPricingRow = typeof creditPricing.$inferInsert;
export type CreditReservation = typeof creditReservations.$inferSelect;
export type NewCreditReservation = typeof creditReservations.$inferInsert;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
