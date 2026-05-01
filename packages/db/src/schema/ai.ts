import { integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
