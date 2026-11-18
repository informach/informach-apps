import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  recreioGameInstances as instances,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreio,
  recreioGameSessions as sessions,
} from "./recreio";

const moment = (name: string) => timestamp(name, { withTimezone: true });
/** Presença privada atestada pela instância; nunca é presença social pública ou concessão de membro. */
export const recreioWorldHostPresences = recreio.table(
  "world_host_presences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").notNull(),
    hostProfileId: uuid("host_profile_id").notNull(),
    hostSessionId: uuid("host_session_id").notNull(),
    hostMemberId: uuid("host_member_id").notNull(),
    instanceId: uuid("instance_id").notNull(),
    fence: integer("fence").notNull(),
    clientKey: uuid("client_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").$type<"active" | "closed">().notNull().default("active"),
    createdAt: moment("created_at").notNull().defaultNow(),
    updatedAt: moment("updated_at").notNull().defaultNow(),
    expiresAt: moment("expires_at").notNull(),
    validUntil: moment("valid_until").notNull(),
    retainUntil: moment("retain_until").notNull(),
    closedAt: moment("closed_at"),
    closeReason: text("close_reason").$type<
      "left" | "session_ended" | "lease_lost" | "policy_changed" | "expired" | "revoked"
    >(),
  },
  (t) => [
    foreignKey({
      name: "recreio_host_presence_member",
      columns: [t.spaceId, t.hostMemberId, t.hostProfileId],
      foreignColumns: [members.spaceId, members.id, members.profileId],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_host_presence_session",
      columns: [t.hostSessionId, t.hostProfileId],
      foreignColumns: [sessions.id, sessions.profileId],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_host_presence_lease",
      columns: [t.spaceId, t.fence],
      foreignColumns: [leases.spaceId, leases.fence],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_host_presence_instance",
      columns: [t.instanceId],
      foreignColumns: [instances.id],
    }).onDelete("restrict"),
    unique("recreio_host_presence_client_key").on(t.instanceId, t.clientKey),
    unique("recreio_host_presence_identity").on(
      t.id,
      t.spaceId,
      t.hostProfileId,
      t.hostSessionId,
      t.hostMemberId,
    ),
    uniqueIndex("recreio_host_presence_one_active")
      .on(t.spaceId, t.hostProfileId)
      .where(sql`${t.closedAt} is null`),
    index("recreio_host_presence_expiry").on(t.expiresAt, t.id).where(sql`${t.closedAt} is null`),
    index("recreio_host_presence_retention")
      .on(t.retainUntil, t.id)
      .where(sql`${t.closedAt} is not null`),
    index("recreio_host_presence_profile").on(t.hostProfileId, t.createdAt),
    check("recreio_host_presence_fence", sql`${t.fence}>=0`),
    check("recreio_host_presence_hash", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "recreio_host_presence_lifecycle",
      sql`(${t.state}='active' and ${t.closedAt} is null and ${t.closeReason} is null) or (${t.state}='closed' and ${t.closedAt} is not null and ${t.closeReason} is not null and ${t.closedAt}>=${t.createdAt} and ${t.closedAt}<=${t.updatedAt} and ${t.closeReason} in ('left','session_ended','lease_lost','policy_changed','expired','revoked'))`,
    ),
    check(
      "recreio_host_presence_window",
      sql`${t.validUntil}>${t.createdAt} and ${t.validUntil}<=${t.createdAt}+interval '24 hours' and ${t.retainUntil}=${t.validUntil}+interval '720 hours'`,
    ),
    check(
      "recreio_host_presence_freshness",
      sql`${t.updatedAt}>=${t.createdAt} and ${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.validUntil} and (${t.state}<>'active' or (${t.expiresAt}>${t.updatedAt} and ${t.expiresAt}<=${t.updatedAt}+interval '45 seconds'))`,
    ),
  ],
);
