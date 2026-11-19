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
import { recreioProfiles as profiles, recreio, recreioSpaces as spaces } from "./recreio";
import { recreioRightsOperations as operations } from "./recreio-direitos-operacoes";

/** Índice de privacidade, não presença nem permissão. A admissão pode deixar
 * autoria no estado mesmo para visitante sem associação de membro. Não expira
 * junto com SID/convite; só a retirada coordenada do perfil o elimina. */
export const recreioProfileWorldTraces = recreio.table(
  "profile_world_traces",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    firstRecordedAt: timestamp("first_recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "recreio_profile_world_trace", columns: [t.profileId, t.spaceId] }),
    index("recreio_world_profile_trace").on(t.spaceId, t.profileId),
  ],
);

export { recreioRightsPreparations } from "./recreio-direitos-preparacao";

/** Referência histórica não é FK destrutiva. O perfil vivo pode ser removido
 * depois dos efeitos, sem apagar a prova do que a operação selecionou. */
export const recreioRightsSubjects = recreio.table(
  "rights_subjects",
  {
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "restrict" }),
    profileReference: uuid("profile_reference").notNull(),
    liveProfileId: uuid("live_profile_id").references(() => profiles.id, { onDelete: "set null" }),
    policyVersion: integer("policy_version").notNull(),
    guardianReference: uuid("guardian_reference"),
    phase: text("phase")
      .$type<"selected" | "minimized" | "removed">()
      .notNull()
      .default("selected"),
    minimizedAt: timestamp("minimized_at", { withTimezone: true }),
    retainedUntil: timestamp("retained_until", { withTimezone: true }),
    retentionPolicyVersion: text("retention_policy_version").$type<"perfil-2026-11-19">(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ name: "recreio_rights_subject", columns: [t.operationId, t.profileReference] }),
    index("recreio_rights_subject_live").on(t.liveProfileId),
    check(
      "recreio_rights_subject_identity",
      sql`${t.liveProfileId} is null or ${t.liveProfileId}=${t.profileReference}`,
    ),
    check("recreio_rights_subject_policy", sql`${t.policyVersion}>=1`),
    check(
      "recreio_rights_subject_phase",
      sql`
      (${t.phase}='selected' and ${t.minimizedAt} is null and ${t.retainedUntil} is null and ${t.completedAt} is null and ${t.retentionPolicyVersion} is null) or
      (${t.phase}='minimized' and ${t.minimizedAt} is not null and ${t.retainedUntil} is not null and ${t.retainedUntil}>${t.minimizedAt} and ${t.liveProfileId} is not null and ${t.completedAt} is null and ${t.retentionPolicyVersion} is not null and ${t.retentionPolicyVersion}='perfil-2026-11-19') or
      (${t.phase}='removed' and ${t.minimizedAt} is not null and ${t.completedAt} is not null and ${t.completedAt}>=${t.minimizedAt} and ${t.liveProfileId} is null and (${t.retainedUntil} is null or ${t.completedAt}>=${t.retainedUntil}) and ${t.retentionPolicyVersion} is not null and ${t.retentionPolicyVersion}='perfil-2026-11-19')`,
    ),
  ],
);

/** Cursor de processamento por mundo: cada fotografia é um passo retomável.
 * Este recibo não é prova de higienização nem autoriza abrir o tráfego. */
export const recreioRightsWorlds = recreio.table(
  "rights_worlds",
  {
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "restrict" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    sourceStatus: text("source_status").$type<"hibernating" | "archived" | "deleted">().notNull(),
    sourceRevision: integer("source_revision").notNull(),
    sourceJournalSeq: bigint("source_journal_seq", { mode: "number" }).notNull(),
    sourceLeaseEpoch: integer("source_lease_epoch").notNull(),
    sourceManagementRevision: integer("source_management_revision").notNull(),
    snapshotCursor: integer("snapshot_cursor").notNull().default(0),
    phase: text("phase")
      .$type<"frozen" | "snapshots" | "dependencies" | "completed">()
      .notNull()
      .default("frozen"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ name: "recreio_rights_world", columns: [t.operationId, t.spaceId] }),
    index("recreio_rights_world_space").on(t.spaceId),
    check(
      "recreio_rights_world_status",
      sql`${t.sourceStatus} in ('hibernating','archived','deleted')`,
    ),
    check(
      "recreio_rights_world_counters",
      sql`${t.sourceRevision}>=0 and ${t.sourceJournalSeq}>=0 and ${t.sourceLeaseEpoch}>=0 and ${t.sourceManagementRevision}>=1 and ${t.snapshotCursor}>=0`,
    ),
    check(
      "recreio_rights_world_phase",
      sql`${t.phase} in ('frozen','snapshots','dependencies','completed')`,
    ),
    check(
      "recreio_rights_world_completion",
      sql`(${t.phase}='completed' and ${t.completedAt} is not null) or (${t.phase}<>'completed' and ${t.completedAt} is null)`,
    ),
  ],
);
