import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreioSpaceMembers as members, recreioProfiles as profiles, recreio } from "./recreio";
import { recreioGuardianLinks as guardians } from "./recreio-familia";
import { recreioWorldHostPresences as presences } from "./recreio-presencas";

const moment = (name: string) => timestamp(name, { withTimezone: true });

/** Namespace separado: leitores antigos de convite de membro nunca aceitam uma visita. */
export const recreioSpaceVisitInvites = recreio.table(
  "space_visit_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").notNull(),
    hostPresenceId: uuid("host_presence_id").notNull(),
    hostSessionId: uuid("host_session_id").notNull(),
    hostMemberId: uuid("host_member_id").notNull(),
    originProfileId: uuid("origin_profile_id").notNull(),
    targetProfileId: uuid("target_profile_id").notNull(),
    clientKey: uuid("client_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state")
      .$type<"pending" | "accepted" | "declined" | "revoked" | "expired">()
      .notNull()
      .default("pending"),
    managementRevision: integer("management_revision").notNull(),
    friendshipRevision: integer("friendship_revision").notNull(),
    originPolicyVersion: integer("origin_policy_version").notNull(),
    targetPolicyVersion: integer("target_policy_version").notNull(),
    originAccessGeneration: uuid("origin_access_generation"),
    targetAccessGeneration: uuid("target_access_generation"),
    createdAt: moment("created_at").notNull().defaultNow(),
    expiresAt: moment("expires_at").notNull(),
    finishedAt: moment("finished_at"),
    retainUntil: moment("retain_until").notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_visit_invite_presence",
      columns: [t.hostPresenceId, t.spaceId, t.originProfileId, t.hostSessionId, t.hostMemberId],
      foreignColumns: [
        presences.id,
        presences.spaceId,
        presences.hostProfileId,
        presences.hostSessionId,
        presences.hostMemberId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_visit_invite_target",
      columns: [t.targetProfileId],
      foreignColumns: [profiles.id],
    }).onDelete("restrict"),
    unique("recreio_visit_invite_retry").on(t.originProfileId, t.clientKey),
    unique("recreio_visit_invite_participants").on(t.id, t.originProfileId, t.targetProfileId),
    unique("recreio_visit_invite_world").on(t.id, t.spaceId),
    unique("recreio_visit_invite_grant_identity").on(
      t.id,
      t.spaceId,
      t.targetProfileId,
      t.hostPresenceId,
    ),
    uniqueIndex("recreio_visit_invite_one_pending")
      .on(t.spaceId, t.originProfileId, t.targetProfileId, t.hostPresenceId)
      .where(sql`${t.state}='pending'`),
    index("recreio_visit_invite_incoming").on(t.targetProfileId, t.createdAt, t.id),
    index("recreio_visit_invite_outgoing").on(t.originProfileId, t.createdAt, t.id),
    index("recreio_visit_invite_world_pending")
      .on(t.spaceId, t.id)
      .where(sql`${t.state}='pending'`),
    index("recreio_visit_invite_presence_pending")
      .on(t.hostPresenceId, t.id)
      .where(sql`${t.state}='pending'`),
    index("recreio_visit_invite_expiry").on(t.expiresAt, t.id).where(sql`${t.state}='pending'`),
    index("recreio_visit_invite_retention").on(t.retainUntil, t.id),
    check("recreio_visit_invite_distinct", sql`${t.originProfileId}<>${t.targetProfileId}`),
    check("recreio_visit_invite_digest", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "recreio_visit_invite_versions",
      sql`${t.managementRevision} between 1 and 2147483646 and ${t.friendshipRevision} between 1 and 2147483646 and ${t.originPolicyVersion}>0 and ${t.targetPolicyVersion}>0`,
    ),
    check(
      "recreio_visit_invite_state",
      sql`${t.state} in ('pending','accepted','declined','revoked','expired')`,
    ),
    check(
      "recreio_visit_invite_expiry",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '24 hours' and ${t.retainUntil}=${t.createdAt}+interval '720 hours'`,
    ),
    check(
      "recreio_visit_invite_lifecycle",
      sql`(${t.state}='pending' and ${t.finishedAt} is null) or (${t.state}<>'pending' and ${t.finishedAt} is not null and ${t.finishedAt}>=${t.createdAt} and (${t.state}<>'accepted' or ${t.finishedAt}<${t.expiresAt}) and (${t.state}<>'expired' or ${t.finishedAt}>=${t.expiresAt}))`,
    ),
  ],
);

/** Decisão de gestão do mundo, independente das decisões de cada responsável. */
export const recreioVisitInviteWorldApprovals = recreio.table(
  "visit_invite_world_approvals",
  {
    inviteId: uuid("invite_id").primaryKey(),
    spaceId: uuid("space_id").notNull(),
    approvedByMemberId: uuid("approved_by_member_id").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    actorKind: text("actor_kind").$type<"jogador" | "responsavel">().notNull(),
    guardianLinkId: uuid("guardian_link_id"),
    accessGeneration: uuid("access_generation"),
    policyVersion: integer("policy_version"),
    managementRevision: integer("management_revision").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "recreio_visit_world_approval_invite",
      columns: [t.inviteId, t.spaceId],
      foreignColumns: [recreioSpaceVisitInvites.id, recreioSpaceVisitInvites.spaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recreio_visit_world_approval_member",
      columns: [t.spaceId, t.approvedByMemberId],
      foreignColumns: [members.spaceId, members.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "recreio_visit_world_approval_user",
      columns: [t.approvedByUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    foreignKey({
      name: "recreio_visit_world_approval_guardian",
      columns: [t.guardianLinkId],
      foreignColumns: [guardians.id],
    }).onDelete("cascade"),
    check(
      "recreio_visit_world_approval_actor",
      sql`(${t.actorKind}='jogador' and ${t.guardianLinkId} is null and ${t.accessGeneration} is null and ${t.policyVersion} is null) or (${t.actorKind}='responsavel' and ${t.guardianLinkId} is not null and ${t.accessGeneration} is not null and ${t.policyVersion} is not null and ${t.policyVersion}>0)`,
    ),
    check(
      "recreio_visit_world_approval_revision",
      sql`${t.managementRevision} between 1 and 2147483646`,
    ),
  ],
);

export const recreioVisitInviteGuardianApprovals = recreio.table(
  "visit_invite_guardian_approvals",
  {
    inviteId: uuid("invite_id").notNull(),
    originProfileId: uuid("origin_profile_id").notNull(),
    targetProfileId: uuid("target_profile_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    guardianLinkId: uuid("guardian_link_id").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    accessGeneration: uuid("access_generation").notNull(),
    policyVersion: integer("policy_version").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "recreio_visit_guardian_approval_pk", columns: [t.inviteId, t.profileId] }),
    foreignKey({
      name: "recreio_visit_guardian_participants",
      columns: [t.inviteId, t.originProfileId, t.targetProfileId],
      foreignColumns: [
        recreioSpaceVisitInvites.id,
        recreioSpaceVisitInvites.originProfileId,
        recreioSpaceVisitInvites.targetProfileId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "recreio_visit_guardian_profile",
      columns: [t.guardianLinkId, t.profileId],
      foreignColumns: [guardians.id, guardians.profileId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recreio_visit_guardian_user",
      columns: [t.approvedByUserId],
      foreignColumns: [users.id],
    }).onDelete("set null"),
    check(
      "recreio_visit_guardian_participant",
      sql`${t.profileId} in (${t.originProfileId},${t.targetProfileId})`,
    ),
    check("recreio_visit_guardian_policy", sql`${t.policyVersion}>0`),
  ],
);

/** Concessão temporária, sem criar/restaurar SpaceMember ou poder de gestão. */
export const recreioWorldVisits = recreio.table(
  "world_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviteId: uuid("invite_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    visitorProfileId: uuid("visitor_profile_id").notNull(),
    hostPresenceId: uuid("host_presence_id").notNull(),
    state: text("state").$type<"active" | "revoked" | "expired">().notNull().default("active"),
    acceptedAt: moment("accepted_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
    expiresAt: moment("expires_at").notNull(),
    endedAt: moment("ended_at"),
    endReason: text("end_reason").$type<
      | "left"
      | "host_left"
      | "lease_lost"
      | "permissions_changed"
      | "access_lost"
      | "blocked"
      | "revoked"
      | "world_closed"
      | "expired"
    >(),
  },
  (t) => [
    foreignKey({
      name: "recreio_visit_grant_invite",
      columns: [t.inviteId, t.spaceId, t.visitorProfileId, t.hostPresenceId],
      foreignColumns: [
        recreioSpaceVisitInvites.id,
        recreioSpaceVisitInvites.spaceId,
        recreioSpaceVisitInvites.targetProfileId,
        recreioSpaceVisitInvites.hostPresenceId,
      ],
    }).onDelete("restrict"),
    unique("recreio_visit_grant_retry").on(t.inviteId),
    unique("recreio_visit_grant_identity").on(t.id, t.spaceId, t.visitorProfileId),
    uniqueIndex("recreio_visit_grant_one_active")
      .on(t.spaceId, t.visitorProfileId)
      .where(sql`${t.endedAt} is null`),
    index("recreio_visit_grant_visitor").on(t.visitorProfileId, t.acceptedAt, t.id),
    index("recreio_visit_grant_host").on(t.hostPresenceId, t.id).where(sql`${t.endedAt} is null`),
    index("recreio_visit_grant_world").on(t.spaceId, t.id).where(sql`${t.endedAt} is null`),
    index("recreio_visit_grant_expiry").on(t.expiresAt, t.id).where(sql`${t.endedAt} is null`),
    check("recreio_visit_grant_state", sql`${t.state} in ('active','revoked','expired')`),
    check(
      "recreio_visit_grant_window",
      sql`${t.expiresAt}>${t.acceptedAt} and ${t.expiresAt}<=${t.acceptedAt}+interval '24 hours' and ${t.updatedAt}>=${t.acceptedAt}`,
    ),
    check(
      "recreio_visit_grant_lifecycle",
      sql`(${t.state}='active' and ${t.endedAt} is null and ${t.endReason} is null) or (${t.state}<>'active' and ${t.endedAt} is not null and ${t.endReason} is not null and ${t.endedAt}>=${t.acceptedAt} and ${t.endedAt}<=${t.updatedAt} and ((${t.state}='expired' and ${t.endReason}='expired' and ${t.endedAt}>=${t.expiresAt}) or (${t.state}='revoked' and ${t.endReason} in ('left','host_left','lease_lost','permissions_changed','access_lost','blocked','revoked','world_closed'))))`,
    ),
  ],
);
