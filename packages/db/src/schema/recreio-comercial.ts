import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio, recreioEntitlements, recreioGroups } from "./recreio";

/** Fila e autoridade financeira por pagante/modo. Uma tentativa falha nunca
 * avança a última confirmação; revisão bloqueia cobertura até conciliação.
 * Leases agendam trabalho, sem conservar transação durante I/O do provedor.
 */
export const recreioBillingReconciliations = recreio.table(
  "billing_reconciliations",
  {
    payerUserId: text("payer_user_id").notNull(),
    groupId: uuid("group_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    reviewRequired: boolean("review_required").notNull().default(true),
    reviewReason: text("review_reason")
      .$type<
        | "awaiting_provider"
        | "customer_unconfirmed"
        | "provider_unavailable"
        | "evidence_mismatch"
        | "adverse_event"
        | "foreign_contract"
      >()
      .default("awaiting_provider"),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.payerUserId, t.providerMode] }),
    unique("recreio_billing_reconciliation_group_mode").on(t.groupId, t.providerMode),
    foreignKey({
      name: "recreio_billing_reconciliation_payer",
      columns: [t.groupId, t.payerUserId],
      foreignColumns: [recreioGroups.id, recreioGroups.ownerUserId],
    }).onDelete("restrict"),
    index("recreio_billing_reconciliation_due").on(t.providerMode, t.nextAttemptAt, t.payerUserId),
    check("recreio_billing_reconciliation_mode", sql`${t.providerMode} in ('dev','prod')`),
    check(
      "recreio_billing_reconciliation_attempt",
      sql`${t.attemptCount} >= 0 and
      ((${t.lastAttemptAt} is null and ${t.attemptCount}=0) or (${t.lastAttemptAt} is not null and ${t.attemptCount}>0))`,
    ),
    check(
      "recreio_billing_reconciliation_confirmation",
      sql`${t.lastConfirmedAt} is null or ${t.lastAttemptAt} is not null`,
    ),
    check(
      "recreio_billing_reconciliation_review",
      sql`
      (${t.reviewRequired} and ${t.reviewReason} is not null and ${t.reviewReason} in ('awaiting_provider','customer_unconfirmed','provider_unavailable','evidence_mismatch','adverse_event','foreign_contract')) or
      (not ${t.reviewRequired} and ${t.reviewReason} is null and ${t.lastConfirmedAt} is not null)`,
    ),
    check(
      "recreio_billing_reconciliation_lease",
      sql`(${t.leaseToken} is null) = (${t.leaseUntil} is null)`,
    ),
    check(
      "recreio_billing_reconciliation_order",
      sql`${t.updatedAt} >= ${t.createdAt} and
      (${t.lastAttemptAt} is null or ${t.lastAttemptAt} >= ${t.createdAt}) and
      (${t.lastConfirmedAt} is null or ${t.lastConfirmedAt} >= ${t.createdAt}) and
      (${t.leaseUntil} is null or ${t.leaseUntil} > ${t.createdAt})`,
    ),
  ],
);

/** Aceite nativo anterior a qualquer I/O de compra, inclusive criar customer.
 * Preserva a identidade enquanto uma operação externa pode existir. O resultado
 * do Checkout é distinto de pagamento conciliado ou direito de jogar.
 */
export const recreioPurchaseAuthorizations = recreio.table(
  "purchase_authorizations",
  {
    id: uuid("id").primaryKey(),
    payerUserId: text("payer_user_id").notNull(),
    groupId: uuid("group_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull().default("dev"),
    productId: text("product_id").notNull(),
    tier: text("tier").$type<"individual" | "family">().notNull(),
    interval: text("interval").$type<"month" | "year">().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").$type<"BRL">().notNull().default("BRL"),
    policyVersion: text("policy_version").notNull(),
    adultDeclarationVersion: text("adult_declaration_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    requestStartedAt: timestamp("request_started_at", { withTimezone: true }),
    providerSessionId: text("provider_session_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    reviewRequired: boolean("review_required").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution").$type<"not_started" | "checkout_completed" | "expired_unpaid">(),
  },
  (t) => [
    uniqueIndex("recreio_purchase_authorization_active")
      .on(t.payerUserId)
      .where(sql`${t.resolvedAt} is null`),
    uniqueIndex("recreio_purchase_authorization_session")
      .on(t.providerSessionId)
      .where(sql`${t.providerSessionId} is not null`),
    uniqueIndex("recreio_purchase_authorization_subscription")
      .on(t.providerSubscriptionId)
      .where(sql`${t.providerSubscriptionId} is not null`),
    foreignKey({
      name: "recreio_purchase_authorization_payer",
      columns: [t.groupId, t.payerUserId],
      foreignColumns: [recreioGroups.id, recreioGroups.ownerUserId],
    }).onDelete("restrict"),
    check("recreio_purchase_authorization_mode", sql`${t.providerMode} in ('dev','prod')`),
    check(
      "recreio_purchase_authorization_subscription_link",
      sql`${t.providerSubscriptionId} is null or
      (${t.requestStartedAt} is not null and ${t.providerSessionId} is not null and ${t.resolution} is distinct from 'expired_unpaid' and length(${t.providerSubscriptionId}) between 8 and 256)`,
    ),
    check(
      "recreio_purchase_authorization_offer",
      sql`${t.tier} in ('individual','family') and ${t.interval} in ('month','year') and ${t.currency}='BRL' and ${t.amountCents}>0 and length(${t.productId}) between 2 and 80`,
    ),
    check(
      "recreio_purchase_authorization_versions",
      sql`length(${t.policyVersion}) between 2 and 64 and length(${t.adultDeclarationVersion}) between 2 and 64`,
    ),
    check(
      "recreio_purchase_authorization_resolution",
      sql`
    (${t.resolvedAt} is null and ${t.resolution} is null) or
    (${t.resolvedAt} is not null and ${t.resolution} is not null and ${t.resolution} in ('not_started','checkout_completed','expired_unpaid'))`,
    ),
    check(
      "recreio_purchase_authorization_order",
      sql`
    (${t.requestStartedAt} is null or ${t.requestStartedAt}>=${t.acceptedAt}) and
    (${t.resolvedAt} is null or ${t.resolvedAt}>=coalesce(${t.requestStartedAt},${t.acceptedAt}))`,
    ),
    check(
      "recreio_purchase_authorization_attempt",
      sql`
    (${t.resolution} is distinct from 'not_started' or (${t.requestStartedAt} is null and ${t.providerSessionId} is null)) and
    (${t.resolution} is null or ${t.resolution}='not_started' or (${t.requestStartedAt} is not null and ${t.providerSessionId} is not null)) and
    (${t.providerSessionId} is null or (${t.requestStartedAt} is not null and length(${t.providerSessionId}) between 8 and 256)) and
    (not ${t.reviewRequired} or (${t.requestStartedAt} is not null and ${t.resolvedAt} is null))`,
    ),
  ],
);

/** Consentimento nativo do pagante; ainda não inicia relógio, concessão ou SID. */
export const recreioTrialEnrollments = recreio.table(
  "trial_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payerUserId: text("payer_user_id").notNull(),
    groupId: uuid("group_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    adultDeclarationVersion: text("adult_declaration_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [
    unique("recreio_trial_enrollment_identity").on(t.id, t.groupId, t.payerUserId, t.policyVersion),
    uniqueIndex("recreio_trial_enrollment_active")
      .on(t.payerUserId)
      .where(sql`${t.withdrawnAt} is null`),
    foreignKey({
      name: "recreio_trial_enrollment_payer",
      columns: [t.groupId, t.payerUserId],
      foreignColumns: [recreioGroups.id, recreioGroups.ownerUserId],
    }).onDelete("restrict"),
    check("recreio_trial_enrollment_policy", sql`length(${t.policyVersion}) between 2 and 64`),
    check(
      "recreio_trial_enrollment_declaration",
      sql`length(${t.adultDeclarationVersion}) between 2 and 64`,
    ),
    check(
      "recreio_trial_enrollment_withdrawal",
      sql`${t.withdrawnAt} is null or ${t.withdrawnAt} >= ${t.acceptedAt}`,
    ),
  ],
);

/** Recibo conservado enquanto conta/grupo existem, confirmado junto à primeira SID.
 * Não é pré-cadastro nem autorização de cobrança. O encerramento F7 resolve
 * este vínculo antes do grupo; remover a cobertura nunca reinicia o teste.
 */
export const recreioTrialClaims = recreio.table(
  "trial_claims",
  {
    payerUserId: text("payer_user_id").primaryKey(),
    groupId: uuid("group_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    entitlementId: uuid("entitlement_id").notNull(),
    entitlementKind: text("entitlement_kind").$type<"trial">().notNull().default("trial"),
    entitlementTier: text("entitlement_tier").$type<"family">().notNull().default("family"),
    cohort: text("cohort").$type<"48h" | "7d">().notNull(),
    policyVersion: text("policy_version").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("recreio_trial_claim_group").on(t.groupId),
    uniqueIndex("recreio_trial_claim_entitlement").on(t.entitlementId),
    foreignKey({
      name: "recreio_trial_claim_enrollment",
      columns: [t.enrollmentId, t.groupId, t.payerUserId, t.policyVersion],
      foreignColumns: [
        recreioTrialEnrollments.id,
        recreioTrialEnrollments.groupId,
        recreioTrialEnrollments.payerUserId,
        recreioTrialEnrollments.policyVersion,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_trial_claim_entitlement_identity",
      columns: [
        t.entitlementId,
        t.groupId,
        t.entitlementKind,
        t.entitlementTier,
        t.startsAt,
        t.endsAt,
      ],
      foreignColumns: [
        recreioEntitlements.id,
        recreioEntitlements.groupId,
        recreioEntitlements.kind,
        recreioEntitlements.tier,
        recreioEntitlements.startsAt,
        recreioEntitlements.endsAt,
      ],
    }).onDelete("restrict"),
    check("recreio_trial_claim_kind", sql`${t.entitlementKind} = 'trial'`),
    check("recreio_trial_claim_tier", sql`${t.entitlementTier} = 'family'`),
    check("recreio_trial_claim_cohort", sql`${t.cohort} in ('48h', '7d')`),
    check("recreio_trial_claim_policy", sql`length(${t.policyVersion}) between 2 and 64`),
    check(
      "recreio_trial_claim_duration",
      sql`
      (${t.cohort} = '48h' and ${t.endsAt} = ${t.startsAt} + interval '48 hours') or
      (${t.cohort} = '7d' and ${t.endsAt} = ${t.startsAt} + interval '168 hours')
    `,
    ),
  ],
);
