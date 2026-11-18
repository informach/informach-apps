import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { billingProviderEnum, subscriptionPaymentPeriods as periods } from "./billing";
import { recreio } from "./recreio";
import { recreioBillingContracts as contracts } from "./recreio-planos";

/** Immutable semantic evidence. Refreshing a read does not duplicate the same
 * proof; adverse facts, source changes or a credited suffix produce a new hash. */
export const recreioFundingObservations = recreio.table(
  "funding_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentPeriodId: uuid("payment_period_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    purchaseId: uuid("purchase_id").notNull(),
    groupId: uuid("group_id").notNull(),
    payerUserId: text("payer_user_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    originProductId: text("origin_product_id").notNull(),
    fundingStatus: text("funding_status").$type<"verified" | "revoked" | "review">().notNull(),
    fundedUntil: timestamp("funded_until", { withTimezone: true }).notNull(),
    policyVersion: text("policy_version").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_funding_observation_period",
      columns: [t.paymentPeriodId, t.subscriptionId, t.provider],
      foreignColumns: [periods.id, periods.subscriptionId, periods.provider],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_funding_observation_contract",
      columns: [
        t.subscriptionId,
        t.purchaseId,
        t.groupId,
        t.payerUserId,
        t.providerMode,
        t.originProductId,
      ],
      foreignColumns: [
        contracts.subscriptionId,
        contracts.purchaseId,
        contracts.groupId,
        contracts.payerUserId,
        contracts.providerMode,
        contracts.originProductId,
      ],
    }).onDelete("restrict"),
    unique("recreio_funding_observation_period_identity").on(t.id, t.paymentPeriodId),
    unique("recreio_funding_observation_owner").on(t.id, t.groupId, t.payerUserId, t.providerMode),
    uniqueIndex("recreio_funding_observation_content").on(
      t.paymentPeriodId,
      t.policyVersion,
      t.evidenceHash,
    ),
    index("recreio_funding_observation_payer").on(t.payerUserId, t.providerMode, t.firstObservedAt),
    check(
      "recreio_funding_observation_scope",
      sql`${t.provider}='stripe' and ${t.providerMode} in ('dev','prod') and length(${t.originProductId}) between 2 and 80`,
    ),
    check(
      "recreio_funding_observation_state",
      sql`${t.fundingStatus} in ('verified','revoked','review') and length(${t.policyVersion}) between 2 and 64 and ${t.evidenceHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "recreio_funding_observation_dates",
      sql`isfinite(${t.fundedUntil}) and isfinite(${t.firstObservedAt})`,
    ),
  ],
);

/** Authoritative latest observation clock, separate from immutable evidence.
 * Native writers reject older reads and conflicts at the same timestamp. */
export const recreioPaymentFunding = recreio.table(
  "payment_funding",
  {
    paymentPeriodId: uuid("payment_period_id").primaryKey(),
    observationId: uuid("observation_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_payment_funding_observation",
      columns: [t.observationId, t.paymentPeriodId],
      foreignColumns: [recreioFundingObservations.id, recreioFundingObservations.paymentPeriodId],
    }).onDelete("restrict"),
    check("recreio_payment_funding_clock", sql`isfinite(${t.observedAt})`),
  ],
);

/** Actual capture totals, not an invented per-period allocation. A source can
 * appear in several proofs; the graph/ledger provides its permitted use. */
export const recreioFundingCaptures = recreio.table(
  "funding_captures",
  {
    observationId: uuid("observation_id")
      .notNull()
      .references(() => recreioFundingObservations.id, { onDelete: "restrict" }),
    providerChargeId: text("provider_charge_id").notNull(),
    amountCapturedCents: bigint("amount_captured_cents", { mode: "number" }).notNull(),
    amountRefundedCents: bigint("amount_refunded_cents", { mode: "number" }).notNull(),
    disputed: boolean("disputed").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observationId, t.providerChargeId] }),
    check(
      "recreio_funding_capture_identity",
      sql`left(${t.providerChargeId},3)='ch_' and length(${t.providerChargeId}) between 8 and 256`,
    ),
    check(
      "recreio_funding_capture_amount",
      sql`${t.amountCapturedCents} between 1 and 9007199254740991 and ${t.amountRefundedCents} between 0 and ${t.amountCapturedCents}`,
    ),
  ],
);

/** Source lines can belong to an earlier native contract of this same payer,
 * group and mode: customer invoice credit survives canceling a subscription.
 * A source from another owner/provider is never an implicit household grant. */
export const recreioFundingSourcePeriods = recreio.table(
  "funding_source_periods",
  {
    observationId: uuid("observation_id").notNull(),
    providerChargeId: text("provider_charge_id").notNull(),
    sourcePaymentPeriodId: uuid("source_payment_period_id").notNull(),
    sourceSubscriptionId: uuid("source_subscription_id").notNull(),
    sourcePurchaseId: uuid("source_purchase_id").notNull(),
    sourceOriginProductId: text("source_origin_product_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    groupId: uuid("group_id").notNull(),
    payerUserId: text("payer_user_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.observationId, t.providerChargeId, t.sourcePaymentPeriodId] }),
    foreignKey({
      name: "recreio_funding_source_capture",
      columns: [t.observationId, t.providerChargeId],
      foreignColumns: [
        recreioFundingCaptures.observationId,
        recreioFundingCaptures.providerChargeId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_funding_source_owner",
      columns: [t.observationId, t.groupId, t.payerUserId, t.providerMode],
      foreignColumns: [
        recreioFundingObservations.id,
        recreioFundingObservations.groupId,
        recreioFundingObservations.payerUserId,
        recreioFundingObservations.providerMode,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_funding_source_period",
      columns: [t.sourcePaymentPeriodId, t.sourceSubscriptionId, t.provider],
      foreignColumns: [periods.id, periods.subscriptionId, periods.provider],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_funding_source_contract",
      columns: [
        t.sourceSubscriptionId,
        t.sourcePurchaseId,
        t.groupId,
        t.payerUserId,
        t.providerMode,
        t.sourceOriginProductId,
      ],
      foreignColumns: [
        contracts.subscriptionId,
        contracts.purchaseId,
        contracts.groupId,
        contracts.payerUserId,
        contracts.providerMode,
        contracts.originProductId,
      ],
    }).onDelete("restrict"),
    check(
      "recreio_funding_source_scope",
      sql`${t.provider}='stripe' and ${t.providerMode} in ('dev','prod')`,
    ),
  ],
);
