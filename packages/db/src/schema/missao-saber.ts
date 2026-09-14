import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const missaoSaber = pgSchema("missao_saber");
const time = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const missaoFamilies = missaoSaber.table(
  "families",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    consentVersion: text("consent_version").notNull(),
    consentAt: time("consent_at"),
    dailyMinutes: integer("daily_minutes").notNull().default(10),
    createdAt: time("created_at"),
  },
  (t) => [check("missao_daily_minutes", sql`${t.dailyMinutes} in (5, 10, 15, 20)`)],
);

export const missaoProfiles = missaoSaber.table(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => missaoFamilies.userId, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    grade: integer("grade").notNull(),
    avatar: text("avatar").notNull().default("cometa"),
    courseId: text("course_id").notNull(),
    accessEnabled: boolean("access_enabled").notNull().default(true),
    createdAt: time("created_at"),
  },
  (t) => [
    index("missao_profiles_owner").on(t.userId),
    check("missao_profile_grade", sql`${t.grade} in (6, 7)`),
  ],
);

export const missaoSessions = missaoSaber.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    mode: text("mode", { enum: ["mission", "review", "diagnostic", "exam"] }).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    requestKey: uuid("request_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    interruptedAt: timestamp("interrupted_at", { withTimezone: true }),
    interruptionReason: text("interruption_reason"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("missao_session_request").on(t.profileId, t.requestKey),
    index("missao_sessions_profile").on(t.profileId, t.createdAt),
  ],
);

export const missaoAttempts = missaoSaber.table(
  "attempts",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => missaoSessions.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    skillId: text("skill_id").notNull(),
    familyId: text("family_id").notNull(),
    answer: text("answer").notNull(),
    correct: boolean("correct"),
    result: text("result", {
      enum: ["correct", "incorrect", "skipped", "reflection"],
    }),
    helpCount: integer("help_count").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("missao_attempt_item").on(t.sessionId, t.itemId),
    index("missao_attempt_session").on(t.sessionId),
  ],
);

export const missaoHints = missaoSaber.table(
  "hints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => missaoSessions.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [
    uniqueIndex("missao_hint_item").on(t.sessionId, t.itemId),
    check("missao_hint_count", sql`${t.count} between 1 and 3`),
  ],
);

export const missaoNotes = missaoSaber.table(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("missao_notes_profile").on(t.profileId, t.createdAt)],
);

export const missaoContentControls = missaoSaber.table(
  "content_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull().default(""),
    status: text("status", { enum: ["available", "suspended", "invalidated"] }).notNull(),
    invalidatedItems: jsonb("invalidated_items")
      .$type<{ itemId: string; itemHash: string }[]>()
      .notNull()
      .default([]),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("missao_content_control_lesson").on(t.lessonId, t.createdAt)],
);

export const missaoReports = missaoSaber.table(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    profileId: uuid("profile_id").references(() => missaoProfiles.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => missaoSessions.id, { onDelete: "set null" }),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    itemId: text("item_id").notNull(),
    category: text("category", {
      enum: ["not_understood", "possible_error", "figure_issue", "app_difficulty"],
    }),
    detail: text("detail").notNull(),
    requestKey: uuid("request_key"),
    status: text("status", { enum: ["open", "investigating", "resolved"] })
      .notNull()
      .default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    index("missao_reports_open").on(t.status, t.createdAt),
    index("missao_reports_recurrence").on(t.lessonId, t.itemId, t.category, t.createdAt),
    uniqueIndex("missao_report_request")
      .on(t.userId, t.requestKey)
      .where(sql`${t.requestKey} is not null`),
    check(
      "missao_report_status",
      sql`${t.status} in ('open', 'investigating', 'resolved') and ((${t.status} = 'resolved') = (${t.resolvedAt} is not null))`,
    ),
    check(
      "missao_report_category",
      sql`${t.category} is null or ${t.category} in ('not_understood', 'possible_error', 'figure_issue', 'app_difficulty')`,
    ),
  ],
);

export const missaoReportUpdates = missaoSaber.table(
  "report_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => missaoReports.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["investigating", "resolved"] }).notNull(),
    note: text("note").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("missao_report_updates_report").on(t.reportId, t.createdAt)],
);

export const missaoExperiments = missaoSaber.table(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["bars", "grid", "groups"] }).notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: time("updated_at"),
  },
  (t) => [uniqueIndex("missao_experiment_profile_kind").on(t.profileId, t.kind)],
);
