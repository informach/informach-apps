import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio, recreioDeviceSessions, recreioGameSessions, recreioGameTickets } from "./recreio";

type EstadoDaTroca = "requested" | "confirmed" | "completed" | "failed" | "canceled" | "expired";
const momento = (nome: string) => timestamp(nome, { withTimezone: true });

/** Intenção técnica de curta duração. Sua retenção não remove a barreira no SID. */
export const recreioSessionHandoffs = recreio.table(
  "session_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull(),
    fromSessionId: uuid("from_session_id").notNull(),
    toDeviceSessionId: uuid("to_device_session_id")
      .notNull()
      .references(() => recreioDeviceSessions.id, { onDelete: "cascade" }),
    ticketJti: uuid("ticket_jti")
      .notNull()
      .references(() => recreioGameTickets.jti, { onDelete: "cascade" }),
    policyVersion: integer("policy_version").notNull(),
    mode: text("mode").$type<"profile" | "server">().notNull(),
    status: text("status").$type<EstadoDaTroca>().notNull().default("requested"),
    requestedAt: momento("requested_at").notNull().defaultNow(),
    expiresAt: momento("expires_at").notNull(),
    confirmedAt: momento("confirmed_at"),
    finishedAt: momento("finished_at"),
    checkpointSpaceId: uuid("checkpoint_space_id"),
    checkpointFence: integer("checkpoint_fence"),
    checkpointRevision: integer("checkpoint_revision"),
    checkpointJournalSeq: integer("checkpoint_journal_seq"),
  },
  (t) => [
    foreignKey({
      name: "recreio_handoff_session_profile",
      columns: [t.fromSessionId, t.profileId],
      foreignColumns: [recreioGameSessions.id, recreioGameSessions.profileId],
    }).onDelete("cascade"),
    uniqueIndex("recreio_handoff_ticket").on(t.ticketJti),
    uniqueIndex("recreio_handoff_pending_session")
      .on(t.fromSessionId)
      .where(sql`${t.status} in ('requested','confirmed')`),
    index("recreio_handoff_retention").on(t.expiresAt, t.id),
    check(
      "recreio_handoff_status",
      sql`${t.status} in ('requested','confirmed','completed','failed','canceled','expired')`,
    ),
    check("recreio_handoff_policy", sql`${t.policyVersion} between 1 and 2147483646`),
    check(
      "recreio_handoff_deadline",
      sql`${t.expiresAt}>${t.requestedAt} and ${t.expiresAt}<=${t.requestedAt}+interval '60 seconds'`,
    ),
    check(
      "recreio_handoff_lifecycle",
      sql`
    (${t.status}='requested' and ${t.confirmedAt} is null and ${t.finishedAt} is null)
    or (${t.status}='confirmed' and ${t.confirmedAt} is not null and ${t.finishedAt} is null)
    or (${t.status}='completed' and ${t.confirmedAt} is not null and ${t.finishedAt} is not null)
    or (${t.status} in ('failed','canceled','expired') and ${t.finishedAt} is not null)
  `,
    ),
    check(
      "recreio_handoff_confirmation_time",
      sql`${t.confirmedAt} is null or (${t.confirmedAt}>=${t.requestedAt} and ${t.confirmedAt}<${t.expiresAt})`,
    ),
    check(
      "recreio_handoff_finished_time",
      sql`${t.finishedAt} is null or ${t.finishedAt}>=${t.requestedAt}`,
    ),
    check(
      "recreio_handoff_proof",
      sql`
    (${t.mode}='profile' and ${t.checkpointSpaceId} is null and ${t.checkpointFence} is null and ${t.checkpointRevision} is null and ${t.checkpointJournalSeq} is null)
    or (${t.mode}='server' and (
      (${t.confirmedAt} is null and ${t.checkpointSpaceId} is null and ${t.checkpointFence} is null and ${t.checkpointRevision} is null and ${t.checkpointJournalSeq} is null)
      or (${t.confirmedAt} is not null and ${t.checkpointSpaceId} is not null and ${t.checkpointFence} is not null and ${t.checkpointFence}>=1 and ${t.checkpointRevision} is not null and ${t.checkpointRevision}>=0 and ${t.checkpointJournalSeq} is not null and ${t.checkpointJournalSeq}>=0)
    ))
  `,
    ),
  ],
);
