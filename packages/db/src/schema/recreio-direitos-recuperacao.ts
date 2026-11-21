import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio } from "./recreio-namespace";

/** Private recovery evidence, never an account, login or permission. The live
 * preparation keeps its original user FK. Imported decisions retain historical
 * authors without manufacturing core identities or impersonating operators. */
export const recreioRightsRecoveryRuns = recreio.table(
  "rights_recovery_runs",
  {
    id: uuid("id").primaryKey(),
    ledgerId: uuid("ledger_id").notNull(),
    frozenHeadSha256: text("frozen_head_sha256").notNull(),
    captureSha256: text("capture_sha256").notNull(),
    frozenEpoch: integer("frozen_epoch").notNull(),
    frozenSigningKeyId: text("frozen_signing_key_id").notNull(),
    nextSigningKeyId: text("next_signing_key_id").notNull(),
    source: text("source").notNull(),
    state: text("state")
      .$type<"replaying" | "verified" | "review">()
      .notNull()
      .default("replaying"),
    receiptSha256: text("receipt_sha256"),
    reviewCode: text("review_code").$type<
      "integrity" | "scope" | "identity" | "finance" | "dependency" | "execution"
    >(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [
    unique("recreio_rights_recovery_run_ledger").on(t.id, t.ledgerId),
    unique("recreio_rights_recovery_fence").on(t.ledgerId, t.frozenHeadSha256),
    check(
      "recreio_rights_recovery_hashes",
      sql`${t.frozenHeadSha256} ~ '^[a-f0-9]{64}$' and
    ${t.captureSha256} ~ '^[a-f0-9]{64}$' and ${t.source} ~ '^[a-f0-9]{40}$' and
    (${t.receiptSha256} is null or ${t.receiptSha256} ~ '^[a-f0-9]{64}$')`,
    ),
    check(
      "recreio_rights_recovery_keys",
      sql`${t.frozenEpoch} between 0 and 14 and
    ${t.frozenSigningKeyId} ~ '^[A-Za-z0-9._-]{1,64}$' and ${t.nextSigningKeyId} ~ '^[A-Za-z0-9._-]{1,64}$' and
    ${t.frozenSigningKeyId}<>${t.nextSigningKeyId}`,
    ),
    check(
      "recreio_rights_recovery_state",
      sql`
    (${t.state}='replaying' and ${t.receiptSha256} is null and ${t.verifiedAt} is null and ${t.reviewCode} is null) or
    (${t.state}='verified' and ${t.receiptSha256} is not null and ${t.verifiedAt} is not null and ${t.reviewCode} is null) or
    (${t.state}='review' and ${t.receiptSha256} is null and ${t.verifiedAt} is null and ${t.reviewCode} is not null and
      ${t.reviewCode} in ('integrity','scope','identity','finance','dependency','execution'))`,
    ),
    check(
      "recreio_rights_recovery_times",
      sql`isfinite(${t.createdAt}) and
    (${t.verifiedAt} is null or (isfinite(${t.verifiedAt}) and ${t.verifiedAt}>=${t.createdAt}))`,
    ),
  ],
);

/** Exact original plan plus an explicit live/absent world map. No FK to a
 * historical author or an absent world. The operation has a compound FK to
 * this scope; these rows do not themselves authorize execution or traffic. */
export const recreioRightsRecoverySources = recreio.table(
  "rights_recovery_sources",
  {
    operationId: uuid("operation_id").primaryKey(),
    runId: uuid("run_id").notNull(),
    ledgerId: uuid("ledger_id").notNull(),
    requesterReference: text("requester_reference").notNull(),
    kind: text("kind").$type<"retirar_perfil" | "encerrar_conta">().notNull(),
    planSha256: text("plan_sha256").notNull(),
    plan: jsonb("plan").$type<unknown>().notNull(),
    worldMap: jsonb("world_map").$type<unknown[]>().notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "recreio_rights_recovery_source_run",
      columns: [t.runId, t.ledgerId],
      foreignColumns: [recreioRightsRecoveryRuns.id, recreioRightsRecoveryRuns.ledgerId],
    }).onDelete("restrict"),
    unique("recreio_rights_recovery_source_scope").on(
      t.operationId,
      t.requesterReference,
      t.planSha256,
      t.kind,
      t.ledgerId,
    ),
    index("recreio_rights_recovery_source_by_run").on(t.runId, t.operationId),
    index("recreio_rights_recovery_source_actor").on(t.requesterReference, t.operationId),
    check(
      "recreio_rights_recovery_source_kind",
      sql`${t.kind} in ('retirar_perfil','encerrar_conta')`,
    ),
    check(
      "recreio_rights_recovery_source_reference",
      sql`char_length(${t.requesterReference}) between 1 and 256 and
    ${t.planSha256} ~ '^[a-f0-9]{64}$' and isfinite(${t.importedAt})`,
    ),
    check(
      "recreio_rights_recovery_source_plan",
      sql`jsonb_typeof(${t.plan})='object' and pg_column_size(${t.plan}) between 2 and 262144`,
    ),
    check(
      "recreio_rights_recovery_source_worlds",
      sql`jsonb_typeof(${t.worldMap})='array' and
    jsonb_array_length(${t.worldMap}) between 0 and 512 and pg_column_size(${t.worldMap})<=131072`,
    ),
  ],
);

/** One assessment per restore, while the first historical source stays
 * immutable. Readiness is a durable receipt for the inherited worker lease;
 * it never recreates an account, changes consent or alone authorizes effects. */
export const recreioRightsRecoveryEvaluations = recreio.table(
  "rights_recovery_evaluations",
  {
    runId: uuid("run_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    ledgerId: uuid("ledger_id").notNull(),
    requesterReference: text("requester_reference").notNull(),
    kind: text("kind").$type<"retirar_perfil" | "encerrar_conta">().notNull(),
    planSha256: text("plan_sha256").notNull(),
    worldMap: jsonb("world_map").$type<unknown[]>().notNull(),
    state: text("state")
      .$type<"staged" | "ready" | "verified" | "review">()
      .notNull()
      .default("staged"),
    origin: text("origin").$type<"native" | "recovered">(),
    preparationReference: uuid("preparation_reference"),
    recoverySourceReference: uuid("recovery_source_reference"),
    admittedHeadSha256: text("admitted_head_sha256"),
    intentSha256: text("intent_sha256"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    reviewCode: text("review_code").$type<
      "integrity" | "scope" | "identity" | "finance" | "dependency" | "execution"
    >(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => {
    const pronta = sql`${t.origin} is not null and ${t.readyAt} is not null and
      ${t.admittedHeadSha256} is not null and ${t.intentSha256} is not null and
      ((${t.origin}='native' and ${t.preparationReference} is not null and ${t.recoverySourceReference} is null) or
       (${t.origin}='recovered' and ${t.preparationReference} is null and ${t.recoverySourceReference} is not null and
        ${t.recoverySourceReference}=${t.operationId}))`;
    const pendente = sql`${t.origin} is null and ${t.readyAt} is null and
      ${t.admittedHeadSha256} is null and ${t.intentSha256} is null and
      ${t.preparationReference} is null and ${t.recoverySourceReference} is null`;
    return [
      primaryKey({ columns: [t.runId, t.operationId] }),
      foreignKey({
        name: "recreio_rights_recovery_evaluation_run",
        columns: [t.runId, t.ledgerId],
        foreignColumns: [recreioRightsRecoveryRuns.id, recreioRightsRecoveryRuns.ledgerId],
      }).onDelete("restrict"),
      foreignKey({
        name: "recreio_rights_recovery_evaluation_source",
        columns: [t.operationId, t.requesterReference, t.planSha256, t.kind, t.ledgerId],
        foreignColumns: [
          recreioRightsRecoverySources.operationId,
          recreioRightsRecoverySources.requesterReference,
          recreioRightsRecoverySources.planSha256,
          recreioRightsRecoverySources.kind,
          recreioRightsRecoverySources.ledgerId,
        ],
      }).onDelete("restrict"),
      index("recreio_rights_recovery_evaluation_queue").on(t.runId, t.state, t.operationId),
      check(
        "recreio_rights_recovery_evaluation_scope",
        sql`
        ${t.kind} in ('retirar_perfil','encerrar_conta') and char_length(${t.requesterReference}) between 1 and 256 and
        ${t.planSha256} ~ '^[a-f0-9]{64}$' and
        (${t.admittedHeadSha256} is null or ${t.admittedHeadSha256} ~ '^[a-f0-9]{64}$') and
        (${t.intentSha256} is null or ${t.intentSha256} ~ '^[a-f0-9]{64}$')`,
      ),
      check(
        "recreio_rights_recovery_evaluation_worlds",
        sql`jsonb_typeof(${t.worldMap})='array' and
        jsonb_array_length(${t.worldMap}) between 0 and 512 and pg_column_size(${t.worldMap})<=131072`,
      ),
      check(
        "recreio_rights_recovery_evaluation_state",
        sql`
        (${t.state}='staged' and (${pendente}) and ${t.verifiedAt} is null and ${t.reviewCode} is null) or
        (${t.state}='ready' and (${pronta}) and ${t.verifiedAt} is null and ${t.reviewCode} is null) or
        (${t.state}='verified' and (${pronta}) and ${t.verifiedAt} is not null and ${t.reviewCode} is null) or
        (${t.state}='review' and ((${pendente}) or (${pronta})) and ${t.verifiedAt} is null and
          ${t.reviewCode} is not null and ${t.reviewCode} in ('integrity','scope','identity','finance','dependency','execution'))`,
      ),
      check(
        "recreio_rights_recovery_evaluation_times",
        sql`isfinite(${t.createdAt}) and
        (${t.readyAt} is null or (isfinite(${t.readyAt}) and ${t.readyAt}>=${t.createdAt})) and
        (${t.verifiedAt} is null or (isfinite(${t.verifiedAt}) and ${t.readyAt} is not null and ${t.verifiedAt}>=${t.readyAt}))`,
      ),
    ];
  },
);

/** Current financial assessment belongs to one recovery run, never replaces
 * the original account-closure financial confirmation. A new attempt clears
 * positive evidence before provider I/O; only its own token may finish it.
 * This receipt alone grants neither data effects nor recovered traffic. */
export const recreioRightsRecoveryFinances = recreio.table(
  "rights_recovery_finances",
  {
    runId: uuid("run_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    ledgerId: uuid("ledger_id").notNull(),
    requesterReference: text("requester_reference").notNull(),
    kind: text("kind").$type<"encerrar_conta">().notNull().default("encerrar_conta"),
    planSha256: text("plan_sha256").notNull(),
    providerMode: text("provider_mode").$type<"dev" | "prod">().notNull(),
    state: text("state").$type<"attempted" | "current" | "review">().notNull(),
    attempts: integer("attempts").notNull(),
    attemptToken: uuid("attempt_token").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    historicalConfirmationSha256: text("historical_confirmation_sha256").notNull(),
    result: text("result").$type<"provider_inventory" | "no_customer">(),
    observationSha256: text("observation_sha256"),
    receiptSha256: text("receipt_sha256"),
    reviewCode: text("review_code").$type<
      | "provider_unavailable"
      | "scope_changed"
      | "foreign_contract"
      | "namespace_mismatch"
      | "invalid_evidence"
      | "ledger_unavailable"
      | "technical_failure"
    >(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.operationId] }),
    foreignKey({
      name: "recreio_recovery_finance_evaluation",
      columns: [t.runId, t.operationId],
      foreignColumns: [
        recreioRightsRecoveryEvaluations.runId,
        recreioRightsRecoveryEvaluations.operationId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_recovery_finance_run",
      columns: [t.runId, t.ledgerId],
      foreignColumns: [recreioRightsRecoveryRuns.id, recreioRightsRecoveryRuns.ledgerId],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_recovery_finance_source",
      columns: [t.operationId, t.requesterReference, t.planSha256, t.kind, t.ledgerId],
      foreignColumns: [
        recreioRightsRecoverySources.operationId,
        recreioRightsRecoverySources.requesterReference,
        recreioRightsRecoverySources.planSha256,
        recreioRightsRecoverySources.kind,
        recreioRightsRecoverySources.ledgerId,
      ],
    }).onDelete("restrict"),
    index("recreio_recovery_finance_state").on(t.runId, t.state, t.operationId),
    index("recreio_recovery_finance_requester").on(t.requesterReference, t.runId, t.operationId),
    check(
      "recreio_recovery_finance_scope",
      sql`${t.kind}='encerrar_conta' and ${t.providerMode} in ('dev','prod') and char_length(${t.requesterReference}) between 1 and 256 and ${t.attempts} between 1 and 2147483647`,
    ),
    check(
      "recreio_recovery_finance_hashes",
      sql`${t.planSha256} ~ '^[a-f0-9]{64}$' and ${t.sourceSha256} ~ '^[a-f0-9]{64}$' and ${t.historicalConfirmationSha256} ~ '^[a-f0-9]{64}$' and (${t.observationSha256} is null or ${t.observationSha256} ~ '^[a-f0-9]{64}$') and (${t.receiptSha256} is null or ${t.receiptSha256} ~ '^[a-f0-9]{64}$')`,
    ),
    check(
      "recreio_recovery_finance_state",
      sql`((
      ${t.state}='attempted' and ${t.result} is null and ${t.observationSha256} is null and ${t.receiptSha256} is null and ${t.observedAt} is null and ${t.reviewCode} is null
    ) or (
      ${t.state}='current' and ${t.receiptSha256} is not null and ${t.observedAt} is not null and ${t.reviewCode} is null and
      ((${t.result}='provider_inventory' and ${t.observationSha256} is not null) or (${t.result}='no_customer' and ${t.observationSha256} is null))
    ) or (
      ${t.state}='review' and ${t.result} is null and ${t.observationSha256} is null and ${t.receiptSha256} is null and ${t.observedAt} is null and
      ${t.reviewCode} in ('provider_unavailable','scope_changed','foreign_contract','namespace_mismatch','invalid_evidence','ledger_unavailable','technical_failure')
    )) is true`,
    ),
    check(
      "recreio_recovery_finance_times",
      sql`isfinite(${t.createdAt}) and isfinite(${t.attemptedAt}) and isfinite(${t.updatedAt}) and ${t.attemptedAt}>=${t.createdAt} and ${t.updatedAt}>=${t.attemptedAt} and (${t.observedAt} is null or (isfinite(${t.observedAt}) and ${t.observedAt}>=${t.attemptedAt} and ${t.observedAt}<=${t.updatedAt}))`,
    ),
  ],
);
