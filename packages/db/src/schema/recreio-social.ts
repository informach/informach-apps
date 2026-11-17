import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { recreioProfiles as profiles, recreio } from "./recreio";
import { recreioGuardianLinks as guardians } from "./recreio-familia";

const moment = (name: string) => timestamp(name, { withTimezone: true });
const created = () => moment("created_at").notNull().defaultNow();

/** Código de uso único: só o resumo fica no servidor, jamais identidade pública. */
export const recreioFriendCodes = recreio.table(
  "friend_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdAt: created(),
    expiresAt: moment("expires_at").notNull(),
    consumedAt: moment("consumed_at"),
    revokedAt: moment("revoked_at"),
  },
  (t) => [
    unique("recreio_friend_code_identity_profile").on(t.id, t.profileId),
    uniqueIndex("recreio_friend_code_hash").on(t.codeHash),
    uniqueIndex("recreio_friend_code_open")
      .on(t.profileId)
      .where(sql`${t.consumedAt} is null and ${t.revokedAt} is null`),
    index("recreio_friend_code_expiry").on(t.expiresAt, t.id),
    check("recreio_friend_code_digest", sql`${t.codeHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "recreio_friend_code_expiry",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '30 minutes'`,
    ),
    check(
      "recreio_friend_code_lifecycle",
      sql`(${t.consumedAt} is null or (${t.consumedAt}>=${t.createdAt} and ${t.consumedAt}<${t.expiresAt})) and (${t.revokedAt} is null or ${t.revokedAt}>=${t.createdAt})`,
    ),
  ],
);

export const recreioFriendRequests = recreio.table(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originProfileId: uuid("origin_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    targetProfileId: uuid("target_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    lowerProfileId: uuid("lower_profile_id")
      .notNull()
      .generatedAlwaysAs(sql`least("origin_profile_id","target_profile_id")`),
    higherProfileId: uuid("higher_profile_id")
      .notNull()
      .generatedAlwaysAs(sql`greatest("origin_profile_id","target_profile_id")`),
    codeId: uuid("code_id").references(() => recreioFriendCodes.id, { onDelete: "set null" }),
    clientKey: uuid("client_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state")
      .$type<"pending" | "accepted" | "rejected" | "revoked" | "expired">()
      .notNull()
      .default("pending"),
    createdAt: created(),
    expiresAt: moment("expires_at").notNull(),
    targetAcceptedAt: moment("target_accepted_at"),
    finishedAt: moment("finished_at"),
  },
  (t) => [
    uniqueIndex("recreio_friend_request_retry").on(t.originProfileId, t.clientKey),
    unique("recreio_friend_request_identity_pair_state").on(
      t.id,
      t.lowerProfileId,
      t.higherProfileId,
      t.state,
    ),
    unique("recreio_friend_request_identity_participants").on(
      t.id,
      t.originProfileId,
      t.targetProfileId,
    ),
    uniqueIndex("recreio_friend_request_code").on(t.codeId),
    uniqueIndex("recreio_friend_request_pair")
      .on(
        sql`least(${t.originProfileId},${t.targetProfileId})`,
        sql`greatest(${t.originProfileId},${t.targetProfileId})`,
      )
      .where(sql`${t.state}='pending'`),
    index("recreio_friend_request_outgoing")
      .on(t.originProfileId, t.expiresAt)
      .where(sql`${t.state}='pending'`),
    index("recreio_friend_request_incoming")
      .on(t.targetProfileId, t.expiresAt)
      .where(sql`${t.state}='pending'`),
    index("recreio_friend_request_expiry").on(t.expiresAt, t.id).where(sql`${t.state}='pending'`),
    index("recreio_friend_request_retention")
      .on(t.finishedAt, t.id)
      .where(sql`${t.state}<>'pending'`),
    check("recreio_friend_request_distinct", sql`${t.originProfileId}<>${t.targetProfileId}`),
    check("recreio_friend_request_digest", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "recreio_friend_request_state",
      sql`${t.state} in ('pending','accepted','rejected','revoked','expired')`,
    ),
    check(
      "recreio_friend_request_expiry",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '72 hours'`,
    ),
    check(
      "recreio_friend_request_acceptance",
      sql`${t.targetAcceptedAt} is null or (${t.targetAcceptedAt}>=${t.createdAt} and ${t.targetAcceptedAt}<${t.expiresAt})`,
    ),
    check(
      "recreio_friend_request_lifecycle",
      sql`
    (${t.state}='pending' and ${t.finishedAt} is null)
    or (${t.state}='accepted' and ${t.targetAcceptedAt} is not null and ${t.finishedAt} is not null
      and ${t.finishedAt}>=${t.targetAcceptedAt} and ${t.finishedAt}<${t.expiresAt})
    or (${t.state} in ('rejected','revoked','expired') and ${t.finishedAt} is not null
      and ${t.finishedAt}>=${t.createdAt} and (${t.state}<>'expired' or ${t.finishedAt}>=${t.expiresAt}))`,
    ),
  ],
);

/** Aprovação é pessoal, do responsável que agiu, e vinculada à geração atual. */
export const recreioFriendConsents = recreio.table(
  "friend_consents",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => recreioFriendRequests.id, { onDelete: "cascade" }),
    requestOriginProfileId: uuid("request_origin_profile_id").notNull(),
    requestTargetProfileId: uuid("request_target_profile_id").notNull(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    guardianLinkId: uuid("guardian_link_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    accessGeneration: uuid("access_generation").notNull(),
    createdAt: created(),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.profileId] }),
    index("recreio_friend_consent_profile").on(t.profileId),
  ],
);

export const recreioFriendships = recreio.table(
  "friendships",
  {
    lowerProfileId: uuid("lower_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    higherProfileId: uuid("higher_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => recreioFriendRequests.id, {
      onDelete: "set null",
    }),
    requestState: text("request_state").$type<"accepted">().notNull().default("accepted"),
    state: text("state").$type<"active" | "removed">().notNull().default("active"),
    revision: integer("revision").notNull().default(1),
    createdAt: created(),
    updatedAt: moment("updated_at").notNull().defaultNow(),
    removedAt: moment("removed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.lowerProfileId, t.higherProfileId] }),
    index("recreio_friendship_lower")
      .on(t.lowerProfileId, t.higherProfileId)
      .where(sql`${t.state}='active'`),
    index("recreio_friendship_higher")
      .on(t.higherProfileId, t.lowerProfileId)
      .where(sql`${t.state}='active'`),
    index("recreio_friendship_retention").on(t.removedAt).where(sql`${t.state}='removed'`),
    index("recreio_friendship_request").on(t.requestId),
    check("recreio_friendship_pair", sql`${t.lowerProfileId}<${t.higherProfileId}`),
    check("recreio_friendship_revision", sql`${t.revision} between 1 and 2147483646`),
    check(
      "recreio_friendship_lifecycle",
      sql`(${t.state}='active' and ${t.requestId} is not null and ${t.removedAt} is null) or (${t.state}='removed' and ${t.removedAt} is not null and ${t.removedAt}>=${t.createdAt})`,
    ),
  ],
);

/** Proteção durável; não expira para voltar a permitir contato indesejado. */
export const recreioSocialBlocks = recreio.table(
  "social_blocks",
  {
    actorProfileId: uuid("actor_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    targetProfileId: uuid("target_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    blocked: boolean("blocked").notNull().default(false),
    muted: boolean("muted").notNull().default(false),
    createdAt: created(),
    updatedAt: moment("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.actorProfileId, t.targetProfileId] }),
    index("recreio_social_block_target").on(t.targetProfileId, t.actorProfileId),
    check("recreio_social_block_distinct", sql`${t.actorProfileId}<>${t.targetProfileId}`),
    check("recreio_social_block_effect", sql`${t.blocked} or ${t.muted}`),
  ],
);

export const recreioSocialPreferences = recreio.table(
  "social_preferences",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    presenceMode: text("presence_mode")
      .$type<"online" | "friends" | "invisible">()
      .notNull()
      .default("friends"),
    updatedAt: moment("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "recreio_social_presence_mode",
      sql`${t.presenceMode} in ('online','friends','invisible')`,
    ),
  ],
);

/** Avisos sem texto/conteúdo: a leitura ainda exige responsabilidade atual. */
export const recreioSocialNotices = recreio.table(
  "social_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guardianUserId: text("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => recreioFriendRequests.id, { onDelete: "cascade" }),
    requestOriginProfileId: uuid("request_origin_profile_id").notNull(),
    requestTargetProfileId: uuid("request_target_profile_id").notNull(),
    createdAt: created(),
    readAt: moment("read_at"),
  },
  (t) => [
    uniqueIndex("recreio_social_notice_once").on(t.guardianUserId, t.profileId, t.requestId),
    index("recreio_social_notice_guardian").on(t.guardianUserId, t.createdAt, t.id),
    index("recreio_social_notice_retention").on(t.createdAt, t.id),
    check("recreio_social_notice_read", sql`${t.readAt} is null or ${t.readAt}>=${t.createdAt}`),
  ],
);
