import { jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const audit = pgSchema("audit");

export const events = audit.table("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  actorId: uuid("actor_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
