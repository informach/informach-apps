import { sql } from "drizzle-orm";
import { check, foreignKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { recreio, recreioEntitlements, recreioGroups } from "./recreio";

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
