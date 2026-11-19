import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { recreioRightsPreparations as preparations } from "./recreio-direitos-preparacao";
import { recreio } from "./recreio-namespace";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** Outbox de consentimentos: os bytes exatos precedem todo I/O externo.
 * Publicar não significa admitir, executar ou concluir a retirada. A prévia e
 * a identidade histórica são RESTRICT; nenhum dado do jogo pertence à outbox. */
export const recreioRightsOperations = recreio.table(
  "rights_operations",
  {
    id: uuid("id").primaryKey(),
    preparationId: uuid("preparation_id").notNull(),
    requesterUserId: text("requester_user_id").notNull(),
    planSha256: text("plan_sha256").notNull(),
    kind: text("kind").$type<"retirar_perfil" | "encerrar_conta">().notNull(),
    revision: integer("revision").notNull().default(1),
    ledgerId: uuid("ledger_id").notNull(),
    ledgerEpoch: integer("ledger_epoch").notNull(),
    signingKeyId: text("signing_key_id").notNull(),
    source: text("source").notNull(),
    signedIntent: bytea("signed_intent").notNull(),
    intentSha256: text("intent_sha256").notNull(),
    authenticatedAt: timestamp("authenticated_at", { withTimezone: true }).notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
    state: text("state")
      .$type<"publishing" | "admitted" | "running" | "completed" | "review">()
      .notNull()
      .default("publishing"),
    admittedHeadSha256: text("admitted_head_sha256"),
    admittedAt: timestamp("admitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewCode: text("review_code").$type<
      "ledger_unavailable" | "ledger_conflict" | "integrity" | "dependency" | "execution"
    >(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    unique("recreio_rights_operation_preparation").on(t.preparationId),
    unique("recreio_rights_operation_participation").on(t.id, t.requesterUserId, t.kind),
    foreignKey({
      name: "recreio_rights_operation_preparation_identity",
      columns: [t.preparationId, t.requesterUserId, t.planSha256, t.kind],
      foreignColumns: [
        preparations.id,
        preparations.requesterUserId,
        preparations.planSha256,
        preparations.kind,
      ],
    }).onDelete("restrict"),
    index("recreio_rights_operation_account").on(t.requesterUserId, t.consentedAt, t.id),
    index("recreio_rights_operation_due").on(t.state, t.nextAttemptAt, t.id),
    check("recreio_rights_operation_kind", sql`${t.kind} in ('retirar_perfil','encerrar_conta')`),
    check("recreio_rights_operation_revision", sql`${t.revision}=1`),
    check("recreio_rights_operation_epoch", sql`${t.ledgerEpoch} between 0 and 15`),
    check("recreio_rights_operation_key", sql`${t.signingKeyId} ~ '^[A-Za-z0-9._-]{1,64}$'`),
    check("recreio_rights_operation_source", sql`${t.source} ~ '^[a-f0-9]{40}$'`),
    check(
      "recreio_rights_operation_intent",
      sql`octet_length(${t.signedIntent}) between 1 and 32768 and ${t.intentSha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "recreio_rights_operation_state",
      sql`${t.state} in ('publishing','admitted','running','completed','review')`,
    ),
    check(
      "recreio_rights_operation_admission",
      sql`
      (${t.admittedHeadSha256} is null and ${t.admittedAt} is null and ${t.state} in ('publishing','review')) or
      (${t.admittedHeadSha256} is not null and ${t.admittedAt} is not null and
       ${t.admittedHeadSha256} ~ '^[a-f0-9]{64}$' and ${t.admittedAt}>=${t.consentedAt} and ${t.state}<>'publishing')`,
    ),
    check(
      "recreio_rights_operation_completion",
      sql`
      (${t.state}='completed' and ${t.completedAt} is not null and ${t.completedAt}>=${t.admittedAt} and ${t.leaseToken} is null) or
      (${t.state}<>'completed' and ${t.completedAt} is null)`,
    ),
    check(
      "recreio_rights_operation_review",
      sql`
      (${t.state}='review' and ${t.reviewCode} is not null and ${t.reviewCode} in ('ledger_unavailable','ledger_conflict','integrity','dependency','execution')) or
      (${t.state}<>'review' and ${t.reviewCode} is null)`,
    ),
    check(
      "recreio_rights_operation_lease",
      sql`
      (${t.leaseToken} is null and ${t.leaseUntil} is null) or
      (${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.leaseUntil}>${t.updatedAt} and ${t.state}<>'completed')`,
    ),
    check(
      "recreio_rights_operation_times",
      sql`
      ${t.authenticatedAt}<=${t.consentedAt} and ${t.consentedAt}<${t.authenticatedAt}+interval '10 minutes' and
      ${t.createdAt}=${t.consentedAt} and ${t.updatedAt}>=${t.createdAt} and ${t.nextAttemptAt}>=${t.createdAt} and ${t.attempts}>=0`,
    ),
  ],
);
