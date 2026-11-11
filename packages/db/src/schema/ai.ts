import { sql } from "drizzle-orm";
import {
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
import { familyGroups } from "./family";

export const ai = pgSchema("ai");

export const agentRuns = ai.table("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  app: text("app").notNull(),
  agent: text("agent").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
});

export const usageLogs = ai.table("usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Short-lived private results, separate from content-free telemetry and the
// financial ledger. Scope is opaque to this package; the app authorizes it.
export const aiOperationReceipts = ai.table(
  "operation_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    app: text("app").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "cascade" }),
    scopeKey: text("scope_key").notNull(),
    webParticipationRevision: integer("web_participation_revision").notNull().default(0),
    feature: text("feature").notNull(),
    requestHash: text("request_hash").notNull(),
    tariff: text("tariff").notNull(),
    maxCredits: integer("max_credits").notNull(),
    runId: uuid("run_id").notNull().defaultRandom(),
    phase: text("phase").$type<"processing" | "output" | "complete" | "failed">().notNull(),
    result: jsonb("result").$type<unknown>(),
    actualCredits: integer("actual_credits"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_operation_receipt_request").on(
      t.app,
      t.actorUserId,
      t.groupId,
      t.scopeKey,
      t.feature,
      t.requestHash,
    ),
    index("ai_operation_receipt_retention").on(t.app, t.expiresAt),
    check("ai_operation_receipt_web_revision", sql`${t.webParticipationRevision} >= 0`),
    check(
      "ai_operation_receipt_phase",
      sql`${t.phase} IN ('processing', 'output', 'complete', 'failed')`,
    ),
    check(
      "ai_operation_receipt_cost",
      sql`${t.maxCredits} > 0 AND (${t.actualCredits} IS NULL OR (${t.actualCredits} > 0 AND ${t.actualCredits} <= ${t.maxCredits}))`,
    ),
    check(
      "ai_operation_receipt_output",
      sql`(${t.result} IS NULL) = (${t.actualCredits} IS NULL) AND (${t.phase} NOT IN ('output', 'complete') OR ${t.result} IS NOT NULL)`,
    ),
  ],
);
