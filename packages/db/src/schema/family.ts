import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const family = pgSchema("family");
const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const moment = (name: string) => timestamp(name, { withTimezone: true });

/** A stable context independent of the subscriber and of an application's data. */
export const familyGroups = family.table(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    archivedAt: moment("archived_at"),
    createdAt: time("created_at"),
  },
  (t) => [check("family_group_name", sql`char_length(${t.name}) between 1 and 80`)],
);

export const familyMembers = family.table(
  "members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role", { enum: ["administrator", "member"] }).notNull(),
    revokedAt: moment("revoked_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("family_members_user").on(t.userId, t.groupId),
    check("family_member_role", sql`${t.role} in ('administrator', 'member')`),
  ],
);

/** Account-linked people read their name from core.users; it is never copied here. */
export const familyPeople = family.table(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    // Historical fitness profiles have no age category. Never infer it from a name.
    kind: text("kind", { enum: ["adult", "dependent", "unclassified"] }).notNull(),
    displayName: text("display_name"),
    color: text("color").notNull().default("#48785C"),
    avatar: text("avatar").notNull().default("person"),
    version: integer("version").notNull().default(1),
    archivedAt: moment("archived_at"),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    uniqueIndex("family_people_account").on(t.userId).where(sql`${t.userId} is not null`),
    check("family_person_kind", sql`${t.kind} in ('adult', 'dependent', 'unclassified')`),
    check(
      "family_person_name_source",
      sql`(${t.userId} is null and ${t.displayName} is not null and char_length(${t.displayName}) between 1 and 80) or (${t.userId} is not null and ${t.displayName} is null)`,
    ),
    check("family_person_color", sql`${t.color} ~ '^#[0-9A-F]{6}$'`),
    check("family_person_avatar", sql`char_length(${t.avatar}) between 1 and 40`),
    check("family_person_version", sql`${t.version} > 0`),
  ],
);

/** Explicit custody of common identity, independent of membership and payment. */
export const familyPersonManagers = family.table(
  "person_managers",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => familyPeople.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.userId] }),
    index("family_person_managers_user").on(t.userId, t.personId),
  ],
);

export const familyGroupPeople = family.table(
  "group_people",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => familyPeople.id, { onDelete: "restrict" }),
    archivedAt: moment("archived_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.personId] }),
    index("family_group_people_person").on(t.personId, t.groupId),
  ],
);

/** Activation of one person in one app/context; domain history keeps its local ID. */
export const familyAppProfiles = family.table(
  "app_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Rotated on identity reassociation/archive; delegated credentials capture this generation. */
    delegationKey: uuid("delegation_key").defaultRandom().notNull(),
    groupId: uuid("group_id").notNull(),
    personId: uuid("person_id").notNull(),
    app: text("app").notNull(),
    sourceKey: text("source_key"),
    archivedAt: moment("archived_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.groupId, t.personId],
      foreignColumns: [familyGroupPeople.groupId, familyGroupPeople.personId],
      name: "family_profile_person_context",
    }).onDelete("restrict"),
    uniqueIndex("family_profile_context").on(t.groupId, t.personId, t.app),
    unique("family_profile_id_context").on(t.id, t.groupId),
    uniqueIndex("family_profile_source")
      .on(t.app, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
    check("family_profile_app", sql`char_length(${t.app}) between 1 and 80`),
  ],
);

/** A grant cannot target a profile or a member from a different context. */
export const familyAccessGrants = family.table(
  "access_grants",
  {
    /** A revoked and recreated permission must not revive credentials derived from the old grant. */
    id: uuid("id").defaultRandom().notNull().unique(),
    groupId: uuid("group_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    userId: text("user_id").notNull(),
    action: text("action", { enum: ["read", "write", "manage", "use_ai"] }).notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.userId, t.action] }),
    foreignKey({
      columns: [t.profileId, t.groupId],
      foreignColumns: [familyAppProfiles.id, familyAppProfiles.groupId],
      name: "family_grant_profile_context",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.groupId, t.userId],
      foreignColumns: [familyMembers.groupId, familyMembers.userId],
      name: "family_grant_member_context",
    }).onDelete("cascade"),
    index("family_grant_user_context").on(t.userId, t.groupId, t.action),
    check("family_grant_action", sql`${t.action} in ('read', 'write', 'manage', 'use_ai')`),
  ],
);

/** Invite tokens are hashed; intended recipient is verified on acceptance. */
export const familyInvitations = family.table(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: moment("expires_at").notNull(),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "restrict" }),
    acceptedAt: moment("accepted_at"),
    revokedAt: moment("revoked_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("family_invitation_token").on(t.tokenHash),
    index("family_invitation_context").on(t.groupId, t.expiresAt),
    check(
      "family_invitation_acceptance",
      sql`(${t.acceptedAt} is null) = (${t.acceptedBy} is null)`,
    ),
  ],
);

/** Provenance of old owner contexts, used only by explicit migration tooling. */
export const familyMigrationSources = family.table(
  "migration_sources",
  {
    app: text("app").notNull(),
    sourceOwnerId: text("source_owner_id").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    migratedAt: time("migrated_at"),
  },
  (t) => [
    primaryKey({ columns: [t.app, t.sourceOwnerId] }),
    index("family_migration_sources_group_idx").on(t.groupId, t.app, t.sourceOwnerId),
  ],
);

/** A named adult must accept responsibility for the common identity. App access is separate. */
export const familyPersonTransfers = family.table(
  "person_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => familyPeople.id, { onDelete: "cascade" }),
    sourceUserId: text("source_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expectedVersion: integer("expected_version").notNull(),
    expiresAt: moment("expires_at").notNull(),
    outcome: text("outcome", { enum: ["accepted", "revoked"] }),
    resolvedAt: moment("resolved_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("person_transfer_pending").on(t.personId).where(sql`${t.resolvedAt} is null`),
    index("person_transfer_recipient").on(t.targetUserId, t.groupId),
    check("person_transfer_distinct_adults", sql`${t.sourceUserId} <> ${t.targetUserId}`),
    check("person_transfer_version", sql`${t.expectedVersion} > 0`),
    check("person_transfer_validity", sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      "person_transfer_resolution",
      sql`(${t.resolvedAt} is null and ${t.outcome} is null) or (${t.resolvedAt} is not null and ${t.outcome} is not null and ${t.outcome} in ('accepted', 'revoked'))`,
    ),
  ],
);

/** Security mutations persist their audit event in the same transaction. No names/content. */
export const familyEvents = family.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id"),
    personId: uuid("person_id"),
    actorId: text("actor_id"),
    event: text("event").notNull(),
    targetId: text("target_id"),
    createdAt: time("created_at"),
  },
  (t) => [index("family_events_context").on(t.groupId, t.createdAt)],
);
