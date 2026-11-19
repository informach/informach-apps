import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { recreioRightsOperations as operations } from "./recreio-direitos-operacoes";
import { recreio } from "./recreio-namespace";
import { recreioBillingContracts as contracts } from "./recreio-planos";

const instante = (name: string) => timestamp(name, { withTimezone: true });

/** Pedido financeiro próprio e recuperável, anterior a qualquer I/O. A
 * confirmação exige observação do provedor; aceitar ou tentar não confirma
 * interrupção da renovação. Referências financeiras são privadas e históricas. */
export const recreioRenewalCancellations = recreio.table(
  "renewal_cancellations",
  {
    id: uuid("id").primaryKey(),
    subscriptionId: uuid("subscription_id").notNull(),
    purchaseId: uuid("purchase_id").notNull(),
    groupId: uuid("group_id").notNull(),
    payerUserId: text("payer_user_id").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    originProductId: text("origin_product_id").notNull(),
    expectedContractRevision: integer("expected_contract_revision").notNull(),
    expectedProductId: text("expected_product_id").notNull(),
    expectedPriceId: text("expected_price_id").notNull(),
    expectedPeriodEnd: instante("expected_period_end").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    initiator: text("initiator").$type<"native" | "account_closure">().notNull(),
    closureOperationId: uuid("closure_operation_id"),
    closureOperationKind: text("closure_operation_kind")
      .$type<"encerrar_conta">()
      .notNull()
      .default("encerrar_conta"),
    policyVersion: text("policy_version").notNull(),
    source: text("source").notNull(),
    authenticatedAt: instante("authenticated_at").notNull(),
    acceptedAt: instante("accepted_at").notNull(),
    state: text("state").$type<"accepted" | "attempted" | "confirmed" | "review">().notNull(),
    requestStartedAt: instante("request_started_at"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: instante("next_attempt_at").notNull(),
    leaseToken: uuid("lease_token"),
    leaseUntil: instante("lease_until"),
    reviewCode: text("review_code").$type<
      | "provider_unavailable"
      | "scope_changed"
      | "foreign_contract"
      | "namespace_mismatch"
      | "invalid_evidence"
    >(),
    providerResult: text("provider_result").$type<"scheduled" | "terminal">(),
    providerStopAt: instante("provider_stop_at"),
    observationSha256: text("observation_sha256"),
    observedAt: instante("observed_at"),
    confirmedAt: instante("confirmed_at"),
    createdAt: instante("created_at").notNull(),
    updatedAt: instante("updated_at").notNull(),
  },
  (t) => [
    unique("recreio_renewal_cancellation_subscription").on(t.subscriptionId),
    foreignKey({
      name: "recreio_renewal_cancellation_contract",
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
    foreignKey({
      name: "recreio_renewal_cancellation_closure",
      columns: [t.closureOperationId, t.payerUserId, t.closureOperationKind],
      foreignColumns: [operations.id, operations.requesterUserId, operations.kind],
    }).onDelete("restrict"),
    index("recreio_renewal_cancellation_due")
      .on(t.state, t.nextAttemptAt, t.id)
      .where(sql`${t.state}<>'confirmed'`),
    index("recreio_renewal_cancellation_payer").on(
      t.payerUserId,
      t.providerMode,
      t.acceptedAt,
      t.id,
    ),
    check(
      "recreio_renewal_cancellation_origin",
      sql`(
      ${t.closureOperationKind}='encerrar_conta' and (
        (${t.initiator}='native' and ${t.closureOperationId} is null) or
        (${t.initiator}='account_closure' and ${t.closureOperationId} is not null)
      )) is true`,
    ),
    check(
      "recreio_renewal_cancellation_terms",
      sql`
      ${t.policyVersion}='renovacao-2026-11-19-v1' and ${t.source} ~ '^[a-f0-9]{40}$' and
      ${t.providerMode} in ('dev','prod') and ${t.expectedContractRevision}>=1 and
      length(${t.expectedProductId}) between 2 and 80 and length(${t.expectedPriceId}) between 8 and 256 and
      ${t.providerCustomerId} ~ '^cus_[A-Za-z0-9]{3,124}$' and ${t.providerSubscriptionId} ~ '^sub_[A-Za-z0-9]{3,124}$'`,
    ),
    check(
      "recreio_renewal_cancellation_state",
      sql`
      ${t.state} in ('accepted','attempted','confirmed','review') and
      (${t.state}<>'accepted' or ${t.requestStartedAt} is null) and
      (${t.state} not in ('attempted','confirmed') or ${t.requestStartedAt} is not null)`,
    ),
    check(
      "recreio_renewal_cancellation_review",
      sql`((
      ${t.state}='review' and ${t.reviewCode} in ('provider_unavailable','scope_changed','foreign_contract','namespace_mismatch','invalid_evidence')
    ) or (${t.state}<>'review' and ${t.reviewCode} is null)) is true`,
    ),
    check(
      "recreio_renewal_cancellation_confirmation",
      sql`((
      ${t.state}='confirmed' and ${t.requestStartedAt} is not null and ${t.observedAt}>=${t.requestStartedAt} and
      ${t.observationSha256} ~ '^[a-f0-9]{64}$' and ${t.confirmedAt}>=${t.observedAt} and ${t.updatedAt}>=${t.confirmedAt} and
      ((${t.providerResult}='scheduled' and ${t.providerStopAt}>${t.observedAt}) or
       (${t.providerResult}='terminal' and ${t.providerStopAt} is null))
    ) or (
      ${t.state}<>'confirmed' and ${t.providerResult} is null and ${t.providerStopAt} is null and
      ${t.observationSha256} is null and ${t.observedAt} is null and ${t.confirmedAt} is null
    )) is true`,
    ),
    check(
      "recreio_renewal_cancellation_lease",
      sql`((
      ${t.leaseToken} is null and ${t.leaseUntil} is null
    ) or (
      ${t.leaseToken} is not null and ${t.leaseUntil}>${t.updatedAt} and ${t.state}<>'confirmed'
    )) is true`,
    ),
    check(
      "recreio_renewal_cancellation_times",
      sql`
      ${t.acceptedAt}>=${t.authenticatedAt} and ${t.acceptedAt}<${t.authenticatedAt}+interval '10 minutes' and
      ${t.createdAt}>=${t.acceptedAt} and ${t.updatedAt}>=${t.createdAt} and ${t.nextAttemptAt}>=${t.createdAt} and
      ((${t.requestStartedAt} is null and ${t.attempts}=0) or
       (${t.requestStartedAt} is not null and ${t.requestStartedAt}>=${t.acceptedAt} and ${t.requestStartedAt}<=${t.updatedAt} and ${t.attempts}>=1))`,
    ),
    check(
      "recreio_renewal_cancellation_finite",
      sql`isfinite(${t.authenticatedAt}) and isfinite(${t.acceptedAt}) and isfinite(${t.expectedPeriodEnd}) and
        isfinite(${t.createdAt}) and isfinite(${t.updatedAt}) and isfinite(${t.nextAttemptAt}) and
        (${t.requestStartedAt} is null or isfinite(${t.requestStartedAt})) and
        (${t.leaseUntil} is null or isfinite(${t.leaseUntil})) and
        (${t.providerStopAt} is null or isfinite(${t.providerStopAt})) and
        (${t.observedAt} is null or isfinite(${t.observedAt})) and
        (${t.confirmedAt} is null or isfinite(${t.confirmedAt}))`,
    ),
  ],
);
