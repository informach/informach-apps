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
    protocolVersion: integer("protocol_version").notNull().default(0),
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
    check("recreio_backup_capture_protocol", sql`${t.protocolVersion} in (0,1)`),
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

/** Publicação separada do destino das fotografias. Nenhuma credencial/chave.
 * Referência do ciphertext vive na captura; bytes assinados são fixados antes
 * do primeiro PUT do índice e sobrevivem a reinício/rotação do worker. */
export const recreioBackupPublications = recreio.table(
  "backup_publications",
  {
    captureId: uuid("capture_id")
      .primaryKey()
      .references(() => recreioBackupCaptures.id, { onDelete: "restrict" }),
    storageScope: text("storage_scope").$type<"qualification" | "production">().notNull(),
    bucketId: uuid("bucket_id").notNull(),
    bucketName: text("bucket_name").notNull(),
    source: text("source").notNull(),
    state: text("state")
      .$type<"prepared" | "file_verified" | "index_prepared" | "published">()
      .notNull(),
    attempt: uuid("attempt").notNull(),
    leaseUntil: momento("lease_until").notNull(),
    createdAt: momento("created_at").notNull().defaultNow(),
    fileVerifiedAt: momento("file_verified_at"),
    indexBody: text("index_body"),
    indexSha256: text("index_sha256"),
    indexPreparedAt: momento("index_prepared_at"),
    publishedAt: momento("published_at"),
  },
  (t) => [
    index("recreio_backup_publication_pending").on(t.state, t.leaseUntil, t.captureId),
    check(
      "recreio_backup_publication_target",
      sql`
      ${t.storageScope} in ('qualification','production') and
      ${t.bucketName} ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' and ${t.source} ~ '^[a-f0-9]{40}$'`,
    ),
    check(
      "recreio_backup_publication_index",
      sql`
      (${t.indexBody} is null and ${t.indexSha256} is null and ${t.indexPreparedAt} is null) or
      (${t.indexBody} is not null and octet_length(${t.indexBody}) between 1 and 32768 and
       ${t.indexSha256} is not null and ${t.indexSha256} ~ '^[a-f0-9]{64}$' and ${t.indexPreparedAt} is not null)`,
    ),
    check(
      "recreio_backup_publication_lifecycle",
      sql`
      (${t.state}='prepared' and ${t.fileVerifiedAt} is null and ${t.indexPreparedAt} is null and ${t.publishedAt} is null) or
      (${t.state}='file_verified' and ${t.fileVerifiedAt} is not null and ${t.indexPreparedAt} is null and ${t.publishedAt} is null) or
      (${t.state}='index_prepared' and ${t.fileVerifiedAt} is not null and ${t.indexPreparedAt} is not null and ${t.publishedAt} is null) or
      (${t.state}='published' and ${t.fileVerifiedAt} is not null and ${t.indexPreparedAt} is not null and ${t.publishedAt} is not null)`,
    ),
    check(
      "recreio_backup_publication_times",
      sql`
      isfinite(${t.createdAt}) and isfinite(${t.leaseUntil}) and ${t.leaseUntil}>${t.createdAt} and
      (${t.fileVerifiedAt} is null or (isfinite(${t.fileVerifiedAt}) and ${t.fileVerifiedAt}>=${t.createdAt})) and
      (${t.indexPreparedAt} is null or (isfinite(${t.indexPreparedAt}) and ${t.indexPreparedAt}>=${t.fileVerifiedAt})) and
      (${t.publishedAt} is null or (isfinite(${t.publishedAt}) and ${t.publishedAt}>=${t.indexPreparedAt}))`,
    ),
  ],
);

/** Tombstone assinado fixado antes do I/O e preservado após ausência. A primeira
 * data não é substituída na reconferência de payloads tardios. Não contém chave. */
export const recreioBackupRetirements = recreio.table(
  "backup_retirements",
  {
    captureId: uuid("capture_id")
      .primaryKey()
      .references(() => recreioBackupCaptures.id, { onDelete: "restrict" }),
    source: text("source").notNull(),
    reason: text("reason").$type<"abandonado" | "retencao" | "privacidade">().notNull(),
    state: text("state").$type<"prepared" | "marked" | "absent">().notNull(),
    markerBody: text("marker_body").notNull(),
    markerSha256: text("marker_sha256").notNull(),
    attempt: uuid("attempt").notNull(),
    leaseUntil: momento("lease_until").notNull(),
    createdAt: momento("created_at").notNull().defaultNow(),
    markerStoredAt: momento("marker_stored_at"),
    firstAbsenceAt: momento("first_absence_at"),
    lastCheckedAt: momento("last_checked_at"),
    nextAttemptAt: momento("next_attempt_at").notNull().defaultNow(),
  },
  (t) => [
    index("recreio_backup_retirement_due").on(t.nextAttemptAt, t.captureId),
    check(
      "recreio_backup_retirement_metadata",
      sql`${t.source} ~ '^[a-f0-9]{40}$' and
    ${t.reason} in ('abandonado','retencao','privacidade') and octet_length(${t.markerBody}) between 1 and 32768
    and ${t.markerSha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "recreio_backup_retirement_lifecycle",
      sql`
    (${t.state}='prepared' and ${t.markerStoredAt} is null and ${t.firstAbsenceAt} is null and ${t.lastCheckedAt} is null) or
    (${t.state}='marked' and ${t.markerStoredAt} is not null and ${t.firstAbsenceAt} is null and ${t.lastCheckedAt} is null) or
    (${t.state}='absent' and ${t.markerStoredAt} is not null and ${t.firstAbsenceAt} is not null and ${t.lastCheckedAt} is not null)`,
    ),
    check(
      "recreio_backup_retirement_times",
      sql`isfinite(${t.createdAt}) and isfinite(${t.leaseUntil}) and
    ${t.leaseUntil}>${t.createdAt} and isfinite(${t.nextAttemptAt}) and
    (${t.markerStoredAt} is null or (isfinite(${t.markerStoredAt}) and ${t.markerStoredAt}>=${t.createdAt})) and
    (${t.firstAbsenceAt} is null or (isfinite(${t.firstAbsenceAt}) and ${t.firstAbsenceAt}>=${t.markerStoredAt})) and
    (${t.lastCheckedAt} is null or (isfinite(${t.lastCheckedAt}) and ${t.lastCheckedAt}>=${t.firstAbsenceAt}))`,
    ),
  ],
);
