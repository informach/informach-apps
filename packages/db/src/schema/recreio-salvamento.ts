import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio, recreioGameSessions, recreioSpaces } from "./recreio";

const momento = (nome: string) => timestamp(nome, { withTimezone: true });

/** Capacidade de persistir e encerrar, nunca uma segunda concessão de gameplay. */
export const recreioSessionSavePermits = recreio.table(
  "session_save_permits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    mode: text("mode").$type<"profile" | "server">().notNull(),
    status: text("status")
      .$type<"ready" | "completed" | "conflicted" | "expired">()
      .notNull()
      .default("ready"),
    createdAt: momento("created_at").notNull().defaultNow(),
    renewedAt: momento("renewed_at").notNull().defaultNow(),
    /** Limite de gameplay, separado da margem exclusiva para persistência. */
    cutoffAt: momento("cutoff_at").notNull(),
    expiresAt: momento("expires_at").notNull(),
    finishedAt: momento("finished_at"),
    reason: text("reason").$type<"time" | "access" | "manual">(),
    requestHash: text("request_hash"),
    /** Somente recibos de revisão/conflito; nunca os bytes do jogo. */
    results: jsonb("results").$type<{ chave: string; revisao: number; conflitoId?: string }[]>(),
    checkpointSpaceId: uuid("checkpoint_space_id").references(() => recreioSpaces.id, {
      onDelete: "restrict",
    }),
    checkpointFence: integer("checkpoint_fence"),
    checkpointRevision: integer("checkpoint_revision"),
    checkpointJournalSeq: integer("checkpoint_journal_seq"),
  },
  (t) => [
    foreignKey({
      name: "recreio_save_session_profile",
      columns: [t.sessionId, t.profileId],
      foreignColumns: [recreioGameSessions.id, recreioGameSessions.profileId],
    }).onDelete("cascade"),
    uniqueIndex("recreio_save_session").on(t.sessionId),
    index("recreio_save_retention").on(t.expiresAt, t.id),
    index("recreio_save_pending_profile")
      .on(t.profileId, t.expiresAt)
      .where(sql`${t.status}='ready'`),
    check("recreio_save_policy", sql`${t.policyVersion} between 1 and 2147483646`),
    check("recreio_save_mode", sql`${t.mode} in ('profile','server')`),
    check("recreio_save_status", sql`${t.status} in ('ready','completed','conflicted','expired')`),
    check(
      "recreio_save_reason",
      sql`${t.reason} is null or ${t.reason} in ('time','access','manual')`,
    ),
    check(
      "recreio_save_deadline",
      sql`${t.renewedAt}>=${t.createdAt} and ${t.cutoffAt}>${t.renewedAt}
    and ${t.expiresAt}=${t.cutoffAt}+interval '30 seconds'
    and ${t.expiresAt}<=${t.renewedAt}+interval '15 minutes 30 seconds'`,
    ),
    check(
      "recreio_save_hash",
      sql`${t.requestHash} is null or ${t.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "recreio_save_results",
      sql`${t.results} is null or (jsonb_typeof(${t.results})='array' and jsonb_array_length(${t.results})<=16)`,
    ),
    check(
      "recreio_save_lifecycle",
      sql`
    (${t.status}='ready' and ${t.finishedAt} is null and ${t.reason} is null and ${t.requestHash} is null)
    or (${t.status}='expired' and ${t.finishedAt} is not null and ${t.finishedAt}>=${t.expiresAt} and ${t.reason} is null and ${t.requestHash} is null)
    or (${t.status} in ('completed','conflicted') and ${t.finishedAt} is not null and ${t.finishedAt}>=${t.createdAt} and ${t.finishedAt}<${t.expiresAt}
      and ${t.reason} is not null and ${t.requestHash} is not null)`,
    ),
    check(
      "recreio_save_proof",
      sql`
    (${t.mode}='profile' and ${t.checkpointSpaceId} is null and ${t.checkpointFence} is null and ${t.checkpointRevision} is null and ${t.checkpointJournalSeq} is null
      and ((${t.status} in ('ready','expired') and ${t.results} is null) or (${t.status} in ('completed','conflicted') and ${t.results} is not null)))
    or (${t.mode}='server' and ${t.results} is null and ${t.status}<>'conflicted' and (
      (${t.status} in ('ready','expired') and ${t.checkpointSpaceId} is null and ${t.checkpointFence} is null and ${t.checkpointRevision} is null and ${t.checkpointJournalSeq} is null)
      or (${t.status}='completed' and ${t.checkpointSpaceId} is not null and ${t.checkpointFence} is not null and ${t.checkpointFence}>=1
        and ${t.checkpointRevision} is not null and ${t.checkpointRevision}>=0 and ${t.checkpointJournalSeq} is not null and ${t.checkpointJournalSeq}>=0)
    ))`,
    ),
  ],
);
