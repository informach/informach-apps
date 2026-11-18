import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { subscriptions } from "./billing";
import { recreio, recreioProfiles } from "./recreio";
import { recreioPurchaseAuthorizations as purchases } from "./recreio-comercial";

/** Immutable offer/quote/selection receipt. Provider I/O starts only after
 * acceptance has been persisted; terminal uncertainty is never inferred. */
export const recreioPlanChanges = recreio.table(
  "plan_changes",
  {
    id: uuid("id").primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    purchaseId: uuid("purchase_id").notNull(),
    groupId: uuid("group_id").notNull(),
    payerUserId: text("payer_user_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    originProductId: text("origin_product_id").notNull(),
    expectedContractRevision: integer("expected_contract_revision").notNull(),
    fromProductId: text("from_product_id").notNull(),
    fromPriceId: text("from_price_id").notNull(),
    toProductId: text("to_product_id").notNull(),
    toPriceId: text("to_price_id").notNull(),
    toAmountCents: integer("to_amount_cents").notNull(),
    toInterval: text("to_interval").$type<"month" | "year">().notNull(),
    kind: text("kind").$type<"upgrade" | "downgrade">().notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    prorationAt: timestamp("proration_at", { withTimezone: true }),
    quotedAmountCents: integer("quoted_amount_cents").notNull(),
    quotedSubtotalCents: integer("quoted_subtotal_cents").notNull(),
    quotedCreditCents: integer("quoted_credit_cents").notNull(),
    quotedTotalCents: integer("quoted_total_cents").notNull(),
    currency: text("currency").$type<"BRL">().notNull(),
    policyVersion: text("policy_version").notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull(),
    quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    requestStartedAt: timestamp("request_started_at", { withTimezone: true }),
    providerScheduleId: text("provider_schedule_id"),
    providerInvoiceId: text("provider_invoice_id"),
    status: text("status")
      .$type<"quoted" | "accepted" | "sent" | "scheduled" | "applied" | "canceled" | "failed">()
      .notNull(),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedRevision: integer("applied_revision"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    reviewRequired: boolean("review_required").notNull().default(false),
  },
  (t) => [
    foreignKey({
      name: "recreio_plan_change_purchase",
      columns: [t.purchaseId, t.groupId, t.payerUserId, t.providerMode, t.originProductId],
      foreignColumns: [
        purchases.id,
        purchases.groupId,
        purchases.payerUserId,
        purchases.providerMode,
        purchases.productId,
      ],
    }).onDelete("restrict"),
    unique("recreio_plan_change_group_identity").on(t.id, t.groupId),
    unique("recreio_plan_change_applied_identity").on(
      t.id,
      t.subscriptionId,
      t.purchaseId,
      t.groupId,
      t.payerUserId,
      t.providerMode,
      t.toProductId,
      t.toPriceId,
      t.appliedAt,
      t.appliedRevision,
    ),
    uniqueIndex("recreio_plan_change_active")
      .on(t.subscriptionId)
      .where(sql`${t.resolvedAt} is null`),
    uniqueIndex("recreio_plan_change_schedule")
      .on(t.providerMode, t.providerScheduleId)
      .where(sql`${t.providerScheduleId} is not null`),
    index("recreio_plan_change_payer").on(t.payerUserId, t.providerMode, t.quotedAt),
    check("recreio_plan_change_mode", sql`${t.providerMode} in ('dev','prod')`),
    check(
      "recreio_plan_change_offer",
      sql`${t.fromProductId} <> ${t.toProductId} and ${t.fromPriceId} <> ${t.toPriceId} and
    length(${t.originProductId}) between 2 and 80 and length(${t.fromProductId}) between 2 and 80 and length(${t.toProductId}) between 2 and 80 and
    length(${t.fromPriceId}) between 8 and 256 and length(${t.toPriceId}) between 8 and 256 and ${t.expectedContractRevision} >= 1 and
    ${t.toAmountCents}>0 and ${t.toInterval} in ('month','year') and
    ${t.quotedAmountCents} >= 0 and ${t.quotedSubtotalCents}>=0 and ${t.quotedCreditCents}<=0 and ${t.currency}='BRL' and length(${t.policyVersion}) between 2 and 64`,
    ),
    check(
      "recreio_plan_change_effect",
      sql`${t.periodEnd} > ${t.periodStart} and
    ((${t.kind}='upgrade' and ${t.prorationAt} is not null and ${t.effectiveAt}=${t.prorationAt} and ${t.effectiveAt}>=${t.periodStart} and ${t.effectiveAt}<${t.periodEnd}) or
     (${t.kind}='downgrade' and ${t.prorationAt} is null and ${t.effectiveAt}=${t.periodEnd} and ${t.quotedAmountCents}=0 and ${t.quotedSubtotalCents}=0 and ${t.quotedCreditCents}=0 and ${t.quotedTotalCents}=0))`,
    ),
    check(
      "recreio_plan_change_quote",
      sql`${t.quoteExpiresAt}>${t.quotedAt} and ${t.quoteExpiresAt}<=${t.quotedAt}+interval '15 minutes' and
    (${t.acceptedAt} is null or (${t.acceptedAt}>=${t.quotedAt} and ${t.acceptedAt}<${t.quoteExpiresAt})) and
    (${t.requestStartedAt} is null or (${t.acceptedAt} is not null and ${t.requestStartedAt}>=${t.acceptedAt} and ${t.requestStartedAt}<${t.quoteExpiresAt}))`,
    ),
    check(
      "recreio_plan_change_status",
      sql`${t.status} in ('quoted','accepted','sent','scheduled','applied','canceled','failed') and
    ((${t.status}='quoted' and ${t.acceptedAt} is null and ${t.requestStartedAt} is null) or
     (${t.status}='accepted' and ${t.acceptedAt} is not null and ${t.requestStartedAt} is null) or
     (${t.status} in ('sent','scheduled','applied') and ${t.acceptedAt} is not null and ${t.requestStartedAt} is not null) or
     ${t.status} in ('canceled','failed')) and
    ((${t.resolvedAt} is not null) = (${t.status} in ('applied','canceled','failed'))) and
    ((${t.appliedAt} is not null) = (${t.status}='applied')) and
    ((${t.appliedRevision} is not null) = (${t.status}='applied')) and
    (${t.appliedRevision} is null or ${t.appliedRevision}=${t.expectedContractRevision}+1) and
    (${t.resolvedAt} is null or ${t.resolvedAt}>=coalesce(${t.requestStartedAt},${t.acceptedAt},${t.quotedAt})) and
    (${t.appliedAt} is null or (${t.appliedAt}>=${t.requestStartedAt} and ${t.appliedAt}>=${t.effectiveAt} and ${t.appliedAt}<=${t.resolvedAt}))`,
    ),
    check(
      "recreio_plan_change_remote",
      sql`(${t.providerScheduleId} is null or (${t.kind}='downgrade' and ${t.requestStartedAt} is not null and length(${t.providerScheduleId}) between 8 and 256)) and
    (${t.providerInvoiceId} is null or (${t.kind}='upgrade' and ${t.requestStartedAt} is not null and length(${t.providerInvoiceId}) between 8 and 256)) and
    (${t.status}<>'scheduled' or ${t.providerScheduleId} is not null) and
    (${t.status}<>'applied' or (${t.kind}='downgrade' and ${t.providerScheduleId} is not null) or (${t.kind}='upgrade' and ${t.providerInvoiceId} is not null)) and
    (${t.cancelRequestedAt} is null or (${t.cancelRequestedAt}>=${t.quotedAt} and (${t.resolvedAt} is null or ${t.cancelRequestedAt}<=${t.resolvedAt}))) and
    (not ${t.reviewRequired} or (${t.requestStartedAt} is not null and ${t.resolvedAt} is null))`,
    ),
  ],
);

/** Explicit current offer authority. A historical applied change is not enough:
 * this row must point at its exact scope, target, application and revision. */
export const recreioBillingContracts = recreio.table(
  "billing_contracts",
  {
    subscriptionId: uuid("subscription_id")
      .primaryKey()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    purchaseId: uuid("purchase_id").notNull(),
    groupId: uuid("group_id").notNull(),
    payerUserId: text("payer_user_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    originProductId: text("origin_product_id").notNull(),
    originPriceId: text("origin_price_id").notNull(),
    currentProductId: text("current_product_id").notNull(),
    currentPriceId: text("current_price_id").notNull(),
    revision: integer("revision").notNull().default(1),
    currentPlanChangeId: uuid("current_plan_change_id"),
    currentPlanAppliedAt: timestamp("current_plan_applied_at", { withTimezone: true }),
    coverageReviewRequired: boolean("coverage_review_required").notNull().default(false),
  },
  (t) => [
    foreignKey({
      name: "recreio_billing_contract_purchase",
      columns: [t.purchaseId, t.groupId, t.payerUserId, t.providerMode, t.originProductId],
      foreignColumns: [
        purchases.id,
        purchases.groupId,
        purchases.payerUserId,
        purchases.providerMode,
        purchases.productId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_billing_contract_current_change",
      columns: [
        t.currentPlanChangeId,
        t.subscriptionId,
        t.purchaseId,
        t.groupId,
        t.payerUserId,
        t.providerMode,
        t.currentProductId,
        t.currentPriceId,
        t.currentPlanAppliedAt,
        t.revision,
      ],
      foreignColumns: [
        recreioPlanChanges.id,
        recreioPlanChanges.subscriptionId,
        recreioPlanChanges.purchaseId,
        recreioPlanChanges.groupId,
        recreioPlanChanges.payerUserId,
        recreioPlanChanges.providerMode,
        recreioPlanChanges.toProductId,
        recreioPlanChanges.toPriceId,
        recreioPlanChanges.appliedAt,
        recreioPlanChanges.appliedRevision,
      ],
    }).onDelete("restrict"),
    index("recreio_billing_contract_payer").on(t.payerUserId, t.providerMode),
    check("recreio_billing_contract_mode", sql`${t.providerMode} in ('dev','prod')`),
    check(
      "recreio_billing_contract_offer",
      sql`length(${t.originPriceId}) between 8 and 256 and length(${t.currentPriceId}) between 8 and 256 and length(${t.currentProductId}) between 2 and 80`,
    ),
    check(
      "recreio_billing_contract_revision",
      sql`
    (${t.revision}=1 and ${t.currentPlanChangeId} is null and ${t.currentPlanAppliedAt} is null and ${t.currentProductId}=${t.originProductId} and ${t.currentPriceId}=${t.originPriceId}) or
    (${t.revision}>1 and ${t.currentPlanChangeId} is not null and ${t.currentPlanAppliedAt} is not null)`,
    ),
  ],
);

/** Complete group selection at quote time. Deletion invalidates the selection;
 * a later job must never restore a revoked or newly replaced profile. */
export const recreioPlanChangeProfiles = recreio.table(
  "plan_change_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planChangeId: uuid("plan_change_id").notNull(),
    groupId: uuid("group_id").notNull(),
    profileReference: uuid("profile_reference").notNull(),
    profileId: uuid("profile_id").references(() => recreioProfiles.id, { onDelete: "set null" }),
    policyVersion: integer("policy_version").notNull(),
    coverageEnabled: boolean("coverage_enabled").notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_plan_selection_change",
      columns: [t.planChangeId, t.groupId],
      foreignColumns: [recreioPlanChanges.id, recreioPlanChanges.groupId],
    }).onDelete("restrict"),
    unique("recreio_plan_selection_profile").on(t.planChangeId, t.profileReference),
    check(
      "recreio_plan_selection_identity",
      sql`${t.policyVersion}>=1 and (${t.profileId} is null or ${t.profileId}=${t.profileReference})`,
    ),
  ],
);
