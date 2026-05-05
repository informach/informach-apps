import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const billing = pgSchema("billing");

export const ownerTypeEnum = billing.enum("owner_type", ["user", "organization"]);

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
]);

export const reservationStatusEnum = billing.enum("reservation_status", [
  "active",
  "committed",
  "released",
  "expired",
]);

export const customers = billing.table(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billingProviderEnum("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    subjectType: ownerTypeEnum("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    email: text("email").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("customers_provider_subject_uniq").on(t.provider, t.subjectType, t.subjectId),
    uniqueIndex("customers_provider_provider_id_uniq").on(t.provider, t.providerCustomerId),
    index("customers_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

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
    index("subscriptions_next_grant_idx")
      .on(t.nextCreditGrantAt)
      .where(sql`${t.nextCreditGrantAt} IS NOT NULL`),
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
    ownerType: ownerTypeEnum("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    estimatedAmount: integer("estimated_amount").notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    app: text("app").notNull(),
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
  ],
);

export const creditLedger = billing.table(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: ownerTypeEnum("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    amount: integer("amount").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    reservationId: uuid("reservation_id").references(() => creditReservations.id, {
      onDelete: "set null",
    }),
    paymentId: uuid("payment_id").references(() => oneTimePayments.id, {
      onDelete: "set null",
    }),
    stripeEventId: text("stripe_event_id"),
    runId: text("run_id"),
    productSku: text("product_sku"),
    actorUserId: text("actor_user_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("credit_ledger_owner_created_idx").on(t.ownerType, t.ownerId, t.createdAt),
    index("credit_ledger_owner_expires_idx")
      .on(t.ownerType, t.ownerId, t.expiresAt)
      .where(sql`${t.expiresAt} IS NOT NULL`),
    uniqueIndex("credit_ledger_stripe_event_uniq").on(t.stripeEventId),
    index("credit_ledger_reservation_idx")
      .on(t.reservationId)
      .where(sql`${t.reservationId} IS NOT NULL`),
    check("credit_ledger_amount_nonzero_chk", sql`${t.amount} <> 0`),
  ],
);

export const webhookEvents = billing.table(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billingProviderEnum("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_uniq").on(t.provider, t.providerEventId),
    index("webhook_events_processed_idx").on(t.processedAt),
    index("webhook_events_event_type_idx").on(t.eventType),
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
