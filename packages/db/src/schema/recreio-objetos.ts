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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio, recreioSpaceSnapshots as snapshots, recreioSpaces as spaces } from "./recreio";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const momento = (name: string) => timestamp(name, { withTimezone: true });

/** Entrega aditiva de uma fotografia. Conteúdo e destino são imutáveis pelo
 * writer; envelope fica durável antes do PUT. Desvincular preserva o recibo de
 * expurgo sem impedir retenção do snapshot. Não autoriza acesso ao mundo. */
export const recreioSnapshotObjectDeliveries = recreio.table(
  "snapshot_object_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotReference: uuid("snapshot_reference").notNull(),
    snapshotId: uuid("snapshot_id"),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    plaintextSha256: text("plaintext_sha256").notNull(),
    plaintextBytes: integer("plaintext_bytes").notNull(),
    storageScope: text("storage_scope").$type<"qualification" | "production">().notNull(),
    bucketId: uuid("bucket_id").notNull(),
    bucketName: text("bucket_name").notNull(),
    objectKey: text("object_key").notNull(),
    cipherSha256: text("cipher_sha256").notNull(),
    cipherBytes: integer("cipher_bytes").notNull(),
    encryptionKeyId: text("encryption_key_id").notNull(),
    formatVersion: integer("format_version").notNull().default(1),
    envelope: bytea("envelope"),
    state: text("state")
      .$type<"prepared" | "verified" | "retiring" | "retired" | "review">()
      .notNull()
      .default("prepared"),
    reviewReason: text("review_reason").$type<
      "integrity" | "missing_key" | "unconfirmed_write" | "scope_changed" | "delete_unconfirmed"
    >(),
    createdAt: momento("created_at").notNull().defaultNow(),
    verifiedAt: momento("verified_at"),
    detachedAt: momento("detached_at"),
    retiredAt: momento("retired_at"),
    nextAttemptAt: momento("next_attempt_at").notNull().defaultNow(),
    lastAttemptAt: momento("last_attempt_at"),
    attemptCount: integer("attempt_count").notNull().default(0),
    leaseToken: uuid("lease_token"),
    leaseUntil: momento("lease_until"),
  },
  (t) => [
    foreignKey({
      name: "recreio_snapshot_object_content",
      columns: [t.snapshotId, t.spaceId, t.plaintextSha256, t.plaintextBytes],
      foreignColumns: [snapshots.id, snapshots.spaceId, snapshots.sha256, snapshots.byteSize],
    }).onDelete("restrict"),
    uniqueIndex("recreio_snapshot_object_link")
      .on(t.snapshotId)
      .where(sql`${t.snapshotId} is not null`),
    unique("recreio_snapshot_object_bucket_key").on(t.bucketId, t.objectKey),
    index("recreio_snapshot_object_due").on(t.state, t.nextAttemptAt, t.id),
    index("recreio_snapshot_object_history").on(t.snapshotReference, t.createdAt),
    index("recreio_snapshot_object_space").on(t.spaceId, t.state),
    check(
      "recreio_snapshot_object_reference",
      sql`(${t.snapshotId} is null or ${t.snapshotId}=${t.snapshotReference}) and
      ((${t.snapshotId} is null)=(${t.detachedAt} is not null))`,
    ),
    check(
      "recreio_snapshot_object_target",
      sql`${t.storageScope} in ('qualification','production') and
      ${t.bucketName} ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' and
      ${t.objectKey}='recreio/v1/fotografia/' || ${t.spaceId}::text || '/' || ${t.cipherSha256}`,
    ),
    check(
      "recreio_snapshot_object_crypto",
      sql`${t.formatVersion}=1 and
      ${t.plaintextSha256} ~ '^[a-f0-9]{64}$' and ${t.cipherSha256} ~ '^[a-f0-9]{64}$' and
      ${t.plaintextBytes} between 0 and 268435456 and
      ${t.cipherBytes} between ${t.plaintextBytes}+40 and ${t.plaintextBytes}+1024 and
      ${t.encryptionKeyId} ~ '^[A-Za-z0-9._-]{1,64}$' and
      (${t.envelope} is null or octet_length(${t.envelope})=${t.cipherBytes})`,
    ),
    check(
      "recreio_snapshot_object_lifecycle",
      sql`
      (${t.state}='prepared' and ${t.snapshotId} is not null and ${t.verifiedAt} is null and ${t.retiredAt} is null and ${t.envelope} is not null) or
      (${t.state}='verified' and ${t.snapshotId} is not null and ${t.verifiedAt} is not null and ${t.retiredAt} is null and ${t.envelope} is null) or
      (${t.state}='retiring' and ${t.snapshotId} is null and ${t.retiredAt} is null and ${t.envelope} is null) or
      (${t.state}='retired' and ${t.snapshotId} is null and ${t.retiredAt} is not null and ${t.envelope} is null) or
      (${t.state}='review' and ${t.retiredAt} is null and (${t.verifiedAt} is not null or ${t.detachedAt} is not null or ${t.envelope} is not null))`,
    ),
    check(
      "recreio_snapshot_object_review",
      sql`((${t.state}='review')=(${t.reviewReason} is not null)) and
      (${t.reviewReason} is null or ${t.reviewReason} in ('integrity','missing_key','unconfirmed_write','scope_changed','delete_unconfirmed'))`,
    ),
    check(
      "recreio_snapshot_object_lease",
      sql`(${t.leaseToken} is null and ${t.leaseUntil} is null) or
      (${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.lastAttemptAt} is not null and
      ${t.leaseUntil}>${t.lastAttemptAt} and ${t.state} in ('prepared','retiring'))`,
    ),
    check(
      "recreio_snapshot_object_attempts",
      sql`${t.attemptCount} between 0 and 2147483646 and
      ((${t.attemptCount}=0 and ${t.lastAttemptAt} is null) or (${t.attemptCount}>0 and ${t.lastAttemptAt} is not null))`,
    ),
    check(
      "recreio_snapshot_object_times",
      sql`isfinite(${t.createdAt}) and isfinite(${t.nextAttemptAt}) and
      (${t.verifiedAt} is null or (isfinite(${t.verifiedAt}) and ${t.verifiedAt}>=${t.createdAt})) and
      (${t.detachedAt} is null or (isfinite(${t.detachedAt}) and ${t.detachedAt}>=${t.createdAt})) and
      (${t.retiredAt} is null or (isfinite(${t.retiredAt}) and ${t.retiredAt}>=${t.detachedAt})) and
      (${t.lastAttemptAt} is null or (isfinite(${t.lastAttemptAt}) and ${t.lastAttemptAt}>=${t.createdAt})) and
      (${t.leaseUntil} is null or isfinite(${t.leaseUntil}))`,
    ),
  ],
);
