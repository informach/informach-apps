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
import {
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreio,
  recreioSpaces as spaces,
} from "./recreio";
import { recreioGuardianLinks as guardians } from "./recreio-familia";

const moment = (name: string) => timestamp(name, { withTimezone: true });

/** Destinatário conhecido; não aceita código adulto como prova de autorização infantil. */
export const recreioDirectedSpaceInvites = recreio.table(
  "directed_space_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    invitedByMemberId: uuid("invited_by_member_id").notNull(),
    originProfileId: uuid("origin_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    targetProfileId: uuid("target_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    clientKey: uuid("client_key").notNull(),
    requestHash: text("request_hash").notNull(),
    participation: text("participation"),
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
    uniqueIndex("recreio_directed_invite_retry").on(t.originProfileId, t.clientKey),
    unique("recreio_directed_invite_participants").on(t.id, t.originProfileId, t.targetProfileId),
    unique("recreio_directed_invite_world").on(t.id, t.spaceId),
    foreignKey({
      name: "recreio_directed_invite_emitter",
      columns: [t.spaceId, t.invitedByMemberId, t.originProfileId],
      foreignColumns: [members.spaceId, members.id, members.profileId],
    }).onDelete("restrict"),
    index("recreio_directed_invite_incoming").on(t.targetProfileId, t.createdAt, t.id),
    index("recreio_directed_invite_world_pending")
      .on(t.spaceId, t.id)
      .where(sql`${t.state}='pending'`),
    index("recreio_directed_invite_expiry").on(t.expiresAt, t.id).where(sql`${t.state}='pending'`),
    index("recreio_directed_invite_retention").on(t.retainUntil, t.id),
    check("recreio_directed_invite_distinct", sql`${t.originProfileId}<>${t.targetProfileId}`),
    check("recreio_directed_invite_digest", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "recreio_directed_invite_versions",
      sql`${t.managementRevision} between 1 and 2147483646 and ${t.friendshipRevision} between 1 and 2147483646 and ${t.originPolicyVersion}>0 and ${t.targetPolicyVersion}>0`,
    ),
    check(
      "recreio_directed_invite_participation",
      sql`${t.participation} is null or char_length(${t.participation})<=64`,
    ),
    check(
      "recreio_directed_invite_state",
      sql`${t.state} in ('pending','accepted','declined','revoked','expired')`,
    ),
    check(
      "recreio_directed_invite_expiry",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '24 hours' and ${t.retainUntil}=${t.createdAt}+interval '30 days'`,
    ),
    check(
      "recreio_directed_invite_lifecycle",
      sql`(${t.state}='pending' and ${t.finishedAt} is null) or (${t.state}<>'pending' and ${t.finishedAt} is not null and ${t.finishedAt}>=${t.createdAt} and (${t.state}<>'accepted' or ${t.finishedAt}<${t.expiresAt}) and (${t.state}<>'expired' or ${t.finishedAt}>=${t.expiresAt}))`,
    ),
  ],
);

/** A decisão do mundo não substitui a aprovação do responsável pelo menor. */
export const recreioDirectedInviteWorldApprovals = recreio.table(
  "directed_invite_world_approvals",
  {
    inviteId: uuid("invite_id").primaryKey(),
    spaceId: uuid("space_id").notNull(),
    approvedByMemberId: uuid("approved_by_member_id").notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorKind: text("actor_kind").$type<"jogador" | "responsavel">().notNull(),
    guardianLinkId: uuid("guardian_link_id").references(() => guardians.id, {
      onDelete: "cascade",
    }),
    accessGeneration: uuid("access_generation"),
    policyVersion: integer("policy_version"),
    managementRevision: integer("management_revision").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "recreio_directed_world_approval_invite",
      columns: [t.inviteId, t.spaceId],
      foreignColumns: [recreioDirectedSpaceInvites.id, recreioDirectedSpaceInvites.spaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recreio_directed_world_approval_member",
      columns: [t.spaceId, t.approvedByMemberId],
      foreignColumns: [members.spaceId, members.id],
    }).onDelete("restrict"),
    index("recreio_directed_world_approval_actor_history").on(t.approvedByUserId, t.inviteId),
    check(
      "recreio_directed_world_approval_actor",
      sql`(${t.actorKind}='jogador' and ${t.guardianLinkId} is null and ${t.accessGeneration} is null and ${t.policyVersion} is null) or (${t.actorKind}='responsavel' and ${t.guardianLinkId} is not null and ${t.accessGeneration} is not null and ${t.policyVersion} is not null and ${t.policyVersion}>0)`,
    ),
    check(
      "recreio_directed_world_approval_revision",
      sql`${t.managementRevision} between 1 and 2147483646`,
    ),
  ],
);

/** Prova nativa atual de cada menor, vinculada à geração e à política observadas. */
export const recreioDirectedInviteGuardianApprovals = recreio.table(
  "directed_invite_guardian_approvals",
  {
    inviteId: uuid("invite_id").notNull(),
    originProfileId: uuid("origin_profile_id").notNull(),
    targetProfileId: uuid("target_profile_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    guardianLinkId: uuid("guardian_link_id").notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    accessGeneration: uuid("access_generation").notNull(),
    policyVersion: integer("policy_version").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.inviteId, t.profileId] }),
    foreignKey({
      name: "recreio_directed_guardian_approval_participants",
      columns: [t.inviteId, t.originProfileId, t.targetProfileId],
      foreignColumns: [
        recreioDirectedSpaceInvites.id,
        recreioDirectedSpaceInvites.originProfileId,
        recreioDirectedSpaceInvites.targetProfileId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "recreio_directed_guardian_approval_profile",
      columns: [t.guardianLinkId, t.profileId],
      foreignColumns: [guardians.id, guardians.profileId],
    }).onDelete("cascade"),
    check(
      "recreio_directed_guardian_approval_participant",
      sql`${t.profileId} in (${t.originProfileId},${t.targetProfileId})`,
    ),
    check("recreio_directed_guardian_approval_policy", sql`${t.policyVersion}>0`),
    index("recreio_directed_guardian_actor_history").on(
      t.approvedByUserId,
      t.inviteId,
      t.profileId,
    ),
  ],
);
