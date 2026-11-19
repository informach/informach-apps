import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./billing";
import { recreioRightsOperations as operations } from "./recreio-direitos-operacoes";
import { recreio } from "./recreio-namespace";

const instante = (name: string) => timestamp(name, { withTimezone: true });
/** Financial reduction belongs to the original account-closure consent. It
 * precedes destructive effects and never replaces payment/renewal receipts. */
export const recreioAccountClosureFinances = recreio.table(
  "account_closure_finances",
  {
    operationId: uuid("operation_id").primaryKey(),
    requesterUserId: text("requester_user_id").notNull(),
    operationKind: text("operation_kind")
      .$type<"encerrar_conta">()
      .notNull()
      .default("encerrar_conta"),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    providerCustomerId: text("provider_customer_id"),
    policyVersion: text("policy_version").notNull(),
    state: text("state")
      .$type<"pending" | "attempted" | "waiting" | "confirmed" | "review">()
      .notNull(),
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
      | "ledger_unavailable"
    >(),
    result: text("result").$type<"provider_inventory" | "no_customer">(),
    observationSha256: text("observation_sha256"),
    observedAt: instante("observed_at"),
    confirmedAt: instante("confirmed_at"),
    createdAt: instante("created_at").notNull(),
    updatedAt: instante("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_account_closure_finance_operation",
      columns: [t.operationId, t.requesterUserId, t.operationKind],
      foreignColumns: [operations.id, operations.requesterUserId, operations.kind],
    }).onDelete("restrict"),
    index("recreio_account_closure_finance_due")
      .on(t.state, t.nextAttemptAt, t.operationId)
      .where(sql`${t.state}<>'confirmed'`),
    check(
      "recreio_account_closure_finance_scope",
      sql`(${t.operationKind}='encerrar_conta' and ${t.providerMode} in ('dev','prod') and ${t.policyVersion}='encerramento-financeiro-2026-11-19-v1' and ((${t.customerId} is null and ${t.providerCustomerId} is null) or (${t.customerId} is not null and ${t.providerCustomerId} ~ '^cus_[A-Za-z0-9_]{3,124}$'))) is true`,
    ),
    check(
      "recreio_account_closure_finance_state",
      sql`${t.state} in ('pending','attempted','waiting','confirmed','review') and (${t.state}<>'pending' or ${t.requestStartedAt} is null) and (${t.state} not in ('attempted','waiting','confirmed') or ${t.requestStartedAt} is not null)`,
    ),
    check(
      "recreio_account_closure_finance_review",
      sql`((${t.state}='review' and ${t.reviewCode} in ('provider_unavailable','scope_changed','foreign_contract','namespace_mismatch','invalid_evidence','ledger_unavailable')) or (${t.state}<>'review' and ${t.reviewCode} is null)) is true`,
    ),
    check(
      "recreio_account_closure_finance_confirmation",
      sql`((
      ${t.state}='confirmed' and ${t.observationSha256} ~ '^[a-f0-9]{64}$' and ${t.observedAt}>=${t.requestStartedAt} and ${t.confirmedAt}>=${t.observedAt} and ${t.updatedAt}>=${t.confirmedAt} and
      ((${t.customerId} is null and ${t.result}='no_customer') or (${t.customerId} is not null and ${t.result}='provider_inventory'))
    ) or (${t.state}<>'confirmed' and ${t.result} is null and ${t.observationSha256} is null and ${t.observedAt} is null and ${t.confirmedAt} is null)) is true`,
    ),
    check(
      "recreio_account_closure_finance_lease",
      sql`((${t.leaseToken} is null and ${t.leaseUntil} is null) or (${t.leaseToken} is not null and ${t.leaseUntil}>${t.updatedAt} and ${t.state}<>'confirmed')) is true`,
    ),
    check(
      "recreio_account_closure_finance_times",
      sql`${t.updatedAt}>=${t.createdAt} and ${t.nextAttemptAt}>=${t.createdAt} and ((${t.requestStartedAt} is null and ${t.attempts}=0) or (${t.requestStartedAt}>=${t.createdAt} and ${t.requestStartedAt}<=${t.updatedAt} and ${t.attempts}>=1)) and isfinite(${t.createdAt}) and isfinite(${t.updatedAt}) and isfinite(${t.nextAttemptAt}) and (${t.requestStartedAt} is null or isfinite(${t.requestStartedAt})) and (${t.leaseUntil} is null or isfinite(${t.leaseUntil})) and (${t.observedAt} is null or isfinite(${t.observedAt})) and (${t.confirmedAt} is null or isfinite(${t.confirmedAt}))`,
    ),
  ],
);
