import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
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
