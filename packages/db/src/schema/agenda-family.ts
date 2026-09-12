import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agenda, agendaActivities, agendaStudentProfiles } from "./agenda";
import { users } from "./core";

// Billing remains attached to the household owner. Every adult authenticates
// independently; profile grants, rather than the owner's identity, authorize reads.
export const agendaFamilyMembers = agenda.table(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_family_one_guest_idx").on(t.ownerUserId),
    uniqueIndex("agenda_family_guest_owner_idx").on(t.userId, t.ownerUserId),
    check("agenda_family_distinct_adults", sql`${t.ownerUserId} <> ${t.userId}`),
  ],
);

export const agendaFamilyProfileAccess = agenda.table(
  "family_profile_access",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => agendaFamilyMembers.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("agenda_family_profile_access_idx").on(t.memberId, t.profileId),
    index("agenda_family_access_profile_idx").on(t.profileId),
  ],
);

export const agendaFamilyInvitations = agenda.table(
  "family_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    profileIds: jsonb("profile_ids").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_family_invite_token_idx").on(t.tokenHash),
    index("agenda_family_invite_owner_idx").on(t.ownerUserId),
  ],
);

export const agendaNotices = agenda.table(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    captureProfileId: uuid("capture_profile_id").references(() => agendaStudentProfiles.id, {
      onDelete: "cascade",
    }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source", { enum: ["teams", "batista", "other"] }).notNull(),
    sourceUrl: text("source_url"),
    publishedAt: date("published_at"),
    text: text("text").notNull().default(""),
    contentHash: text("content_hash").notNull(),
    // Null means the original's complete child scope has not been reviewed.
    sourceProfileIds: jsonb("source_profile_ids").$type<string[] | null>(),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type"),
    attachmentData: text("attachment_data"),
    attachmentExpiresAt: timestamp("attachment_expires_at", { withTimezone: true }),
    status: text("status", { enum: ["processing", "ready", "failed", "confirmed"] })
      .notNull()
      .default("processing"),
    isTrial: boolean("is_trial").notNull().default(false),
    parsedResult: jsonb("parsed_result").$type<unknown>(),
    billingRunId: uuid("billing_run_id"),
    failureCode: text("failure_code"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_notices_owner_hash_idx").on(t.ownerUserId, t.contentHash),
    index("agenda_notices_owner_created_idx").on(t.ownerUserId, t.createdAt),
    index("agenda_notices_expiry_idx").on(t.attachmentExpiresAt),
    check(
      "agenda_notice_status_check",
      sql`${t.status} IN ('processing','ready','failed','confirmed')`,
    ),
  ],
);

export const agendaNoticeApplications = agenda.table(
  "notice_applications",
  {
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => agendaNotices.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agenda_notice_application_profile_idx").on(t.noticeId, t.profileId)],
);

export const AGENDA_ACTION_TYPES = [
  "task",
  "exam",
  "project",
  "reminder",
  "material",
  "authorization",
  "event",
  "study",
] as const;
export const AGENDA_DATE_ORIGINS = ["unspecified", "school", "relative", "family"] as const;

export const agendaNoticeActions = agenda.table(
  "notice_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noticeId: uuid("notice_id").references(() => agendaNotices.id, { onDelete: "set null" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type", { enum: AGENDA_ACTION_TYPES }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: date("due_at"),
    time: text("time"),
    location: text("location"),
    dateOrigin: text("date_origin", { enum: AGENDA_DATE_ORIGINS }).notNull().default("unspecified"),
    sourceExcerpt: text("source_excerpt"),
    status: text("status", { enum: ["pending", "done", "canceled"] })
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    recurrence: text("recurrence", { enum: ["none", "weekly"] })
      .notNull()
      .default("none"),
    seriesId: uuid("series_id"),
    version: integer("version").notNull().default(1),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agenda_notice_actions_profile_due_idx").on(t.profileId, t.dueAt),
    index("agenda_notice_actions_reminder_idx").on(t.reminderAt, t.status),
    uniqueIndex("agenda_notice_actions_notice_profile_idx").on(
      t.noticeId,
      t.profileId,
      t.fingerprint,
    ),
    uniqueIndex("agenda_notice_actions_series_due_idx").on(t.seriesId, t.profileId, t.dueAt),
    check(
      "agenda_action_date_origin_check",
      sql`(${t.dueAt} IS NULL AND ${t.dateOrigin} = 'unspecified') OR (${t.dueAt} IS NOT NULL AND ${t.dateOrigin} IN ('school','relative','family'))`,
    ),
    check(
      "agenda_action_time_check",
      sql`${t.time} IS NULL OR (${t.dueAt} IS NOT NULL AND ${t.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
    check("agenda_action_status_check", sql`${t.status} IN ('pending','done','canceled')`),
  ],
);

export const agendaActivityRevisions = agenda.table(
  "activity_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").references(() => agendaActivities.id, { onDelete: "cascade" }),
    noticeActionId: uuid("notice_action_id").references(() => agendaNoticeActions.id, {
      onDelete: "cascade",
    }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    version: integer("version").notNull(),
    previous: jsonb("previous").$type<Record<string, unknown>>().notNull(),
    current: jsonb("current").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_activity_revision_version_idx").on(t.activityId, t.version),
    uniqueIndex("agenda_notice_revision_version_idx").on(t.noticeActionId, t.version),
    check(
      "agenda_revision_one_target",
      sql`(${t.activityId} IS NOT NULL) <> (${t.noticeActionId} IS NOT NULL)`,
    ),
  ],
);

export const agendaNotificationPreferences = agenda.table(
  "notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    digestHour: integer("digest_hour").notNull().default(19),
    quietStart: integer("quiet_start").notNull().default(21),
    quietEnd: integer("quiet_end").notNull().default(7),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "agenda_notification_hours_check",
      sql`${t.digestHour} BETWEEN 0 AND 23 AND ${t.quietStart} BETWEEN 0 AND 23 AND ${t.quietEnd} BETWEEN 0 AND 23`,
    ),
  ],
);

export const agendaPushSubscriptions = agenda.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_push_endpoint_idx").on(t.endpoint),
    index("agenda_push_user_idx").on(t.userId),
  ],
);

export const agendaNotificationDeliveries = agenda.table(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageKey: text("message_key").notNull(),
    channel: text("channel", { enum: ["email", "push"] }).notNull(),
    status: text("status", { enum: ["pending", "processing", "sent", "failed", "canceled"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("agenda_delivery_idempotency_idx").on(t.userId, t.channel, t.messageKey)],
);

export const agendaCalendarFeeds = agenda.table(
  "calendar_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_feed_token_idx").on(t.tokenHash),
    index("agenda_feed_user_idx").on(t.userId),
  ],
);

// Only enumerated, content-free fields are accepted by the product event service.
export const agendaProductEvents = agenda.table(
  "product_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    event: text("event").notNull(),
    source: text("source"),
    count: integer("count"),
    durationMs: integer("duration_ms"),
    landingContext: jsonb("landing_context").$type<{
      variant: "family-routine-v1";
      placement?: "hero" | "demo" | "pricing" | "final";
      selection?: { plan: "free" } | { plan: "pro"; cycle: "monthly" | "annual" };
      scenario?: "passeio" | "prova" | "material";
      action?: "scenario" | "plan" | "complete";
      firstCta?: boolean;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agenda_product_event_time_idx").on(t.event, t.createdAt)],
);
