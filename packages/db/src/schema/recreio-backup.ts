import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio } from "./recreio";
import { recreioSnapshotObjectDeliveries as deliveries } from "./recreio-objetos";

const momento = (name: string) => timestamp(name, { withTimezone: true });
const tamanho = (name: string) => bigint(name, { mode: "number" });

/** Controle de captura; não guarda dump, chave ou credenciais. Referência do
 * arquivo é persistida antes de tentar PUT. Uma captura interrompida não libera
 * reservas por prazo: exige arquivo verificado ou abandono conciliado. */
export const recreioBackupCaptures = recreio.table(
  "backup_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageScope: text("storage_scope").$type<"qualification" | "production">().notNull(),
    bucketId: uuid("bucket_id").notNull(),
    bucketName: text("bucket_name").notNull(),
    state: text("state")
      .$type<"preparing" | "captured" | "sealed" | "verified" | "abandoned" | "review">()
      .notNull()
      .default("preparing"),
    inventorySha256: text("inventory_sha256"),
    objectCount: integer("object_count"),
    objectBytes: tamanho("object_bytes"),
    archiveSha256: text("archive_sha256"),
    archiveBytes: tamanho("archive_bytes"),
    cipherSha256: text("cipher_sha256"),
    cipherBytes: tamanho("cipher_bytes"),
    encryptionKeyId: text("encryption_key_id"),
    objectKey: text("object_key"),
    createdAt: momento("created_at").notNull().defaultNow(),
    capturedAt: momento("captured_at"),
    sealedAt: momento("sealed_at"),
    verifiedAt: momento("verified_at"),
    abandonedAt: momento("abandoned_at"),
    absenceConfirmedAt: momento("absence_confirmed_at"),
    reviewReason: text("review_reason").$type<
      | "integrity"
      | "missing_key"
      | "source_lost"
      | "destination_changed"
      | "unconfirmed_write"
      | "delete_unconfirmed"
    >(),
  },
  (t) => [
    index("recreio_backup_capture_state").on(t.state, t.createdAt, t.id),
    index("recreio_backup_capture_destination").on(t.bucketId, t.state),
    check(
      "recreio_backup_capture_target",
      sql`${t.storageScope} in ('qualification','production') and ${t.bucketName} ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'`,
    ),
    check(
      "recreio_backup_capture_inventory",
      sql`
    (${t.capturedAt} is null and ${t.inventorySha256} is null and ${t.objectCount} is null and ${t.objectBytes} is null) or
    (${t.capturedAt} is not null and ${t.inventorySha256} is not null and ${t.inventorySha256} ~ '^[a-f0-9]{64}$' and
      ${t.objectCount} is not null and ${t.objectCount} between 0 and 1000000 and
      ${t.objectBytes} is not null and ${t.objectBytes} between 0 and 68719476736)`,
    ),
    check(
      "recreio_backup_capture_archive",
      sql`
    (${t.sealedAt} is null and ${t.archiveSha256} is null and ${t.archiveBytes} is null and ${t.cipherSha256} is null and
      ${t.cipherBytes} is null and ${t.encryptionKeyId} is null and ${t.objectKey} is null) or
    (${t.sealedAt} is not null and ${t.capturedAt} is not null and
      ${t.archiveSha256} is not null and ${t.archiveSha256} ~ '^[a-f0-9]{64}$' and
      ${t.archiveBytes} is not null and ${t.archiveBytes} between 0 and 68719476736 and
      ${t.cipherSha256} is not null and ${t.cipherSha256} ~ '^[a-f0-9]{64}$' and
      ${t.cipherBytes} is not null and ${t.cipherBytes} between ${t.archiveBytes}+40 and ${t.archiveBytes}+1024 and
      ${t.encryptionKeyId} is not null and ${t.encryptionKeyId} ~ '^[A-Za-z0-9._-]{1,64}$' and
      ${t.objectKey} is not null and ${t.objectKey}='recreio/v1/backup/' || ${t.id}::text || '/' || ${t.cipherSha256})`,
    ),
    check(
      "recreio_backup_capture_lifecycle",
      sql`
    (${t.state}='preparing' and ${t.capturedAt} is null and ${t.sealedAt} is null and ${t.verifiedAt} is null and ${t.abandonedAt} is null) or
    (${t.state}='captured' and ${t.capturedAt} is not null and ${t.sealedAt} is null and ${t.verifiedAt} is null and ${t.abandonedAt} is null) or
    (${t.state}='sealed' and ${t.sealedAt} is not null and ${t.verifiedAt} is null and ${t.abandonedAt} is null) or
    (${t.state}='verified' and ${t.sealedAt} is not null and ${t.verifiedAt} is not null and ${t.abandonedAt} is null) or
    (${t.state}='abandoned' and ${t.verifiedAt} is null and ${t.abandonedAt} is not null and
      (${t.sealedAt} is null or ${t.absenceConfirmedAt} is not null)) or
    (${t.state}='review' and ${t.verifiedAt} is null and ${t.abandonedAt} is null)`,
    ),
    check(
      "recreio_backup_capture_review",
      sql`
    ((${t.state}='review')=(${t.reviewReason} is not null)) and
    (${t.reviewReason} is null or ${t.reviewReason} in ('integrity','missing_key','source_lost','destination_changed','unconfirmed_write','delete_unconfirmed'))`,
    ),
    check(
      "recreio_backup_capture_times",
      sql`
    isfinite(${t.createdAt}) and
    (${t.capturedAt} is null or (isfinite(${t.capturedAt}) and ${t.capturedAt}>=${t.createdAt})) and
    (${t.sealedAt} is null or (isfinite(${t.sealedAt}) and ${t.sealedAt}>=${t.capturedAt})) and
    (${t.verifiedAt} is null or (isfinite(${t.verifiedAt}) and ${t.verifiedAt}>=${t.sealedAt})) and
    (${t.absenceConfirmedAt} is null or (${t.sealedAt} is not null and isfinite(${t.absenceConfirmedAt}) and ${t.absenceConfirmedAt}>=${t.sealedAt})) and
    (${t.abandonedAt} is null or (isfinite(${t.abandonedAt}) and ${t.abandonedAt}>=${t.createdAt} and
      (${t.absenceConfirmedAt} is null or ${t.abandonedAt}>=${t.absenceConfirmedAt})))`,
    ),
    check(
      "recreio_backup_capture_absence",
      sql`${t.absenceConfirmedAt} is null or ${t.state} in ('sealed','abandoned','review')`,
    ),
  ],
);

/** Reservas conservam o recibo após a liberação. A fotografia pode ser retirada
 * da tabela de snapshots; a entrega e a reserva sobrevivem por FK RESTRICT.
 * reference_sha256 fixa a identidade completa inventariada pelo controlador. */
export const recreioBackupObjectHolds = recreio.table(
  "backup_object_holds",
  {
    captureId: uuid("capture_id")
      .notNull()
      .references(() => recreioBackupCaptures.id, { onDelete: "restrict" }),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "restrict" }),
    referenceSha256: text("reference_sha256").notNull(),
    createdAt: momento("created_at").notNull().defaultNow(),
    releasedAt: momento("released_at"),
    releaseReason: text("release_reason").$type<"stored_archive" | "abandoned">(),
  },
  (t) => [
    primaryKey({ name: "recreio_backup_object_hold_pk", columns: [t.captureId, t.deliveryId] }),
    index("recreio_backup_object_hold_active")
      .on(t.deliveryId, t.captureId)
      .where(sql`${t.releasedAt} is null`),
    check("recreio_backup_object_hold_reference", sql`${t.referenceSha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "recreio_backup_object_hold_release",
      sql`
    (${t.releasedAt} is null and ${t.releaseReason} is null) or
    (${t.releasedAt} is not null and ${t.releaseReason} is not null and ${t.releaseReason} in ('stored_archive','abandoned'))`,
    ),
    check(
      "recreio_backup_object_hold_times",
      sql`isfinite(${t.createdAt}) and (${t.releasedAt} is null or (isfinite(${t.releasedAt}) and ${t.releasedAt}>=${t.createdAt}))`,
    ),
  ],
);
