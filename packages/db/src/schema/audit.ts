import { index, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const audit = pgSchema("audit");

export const events = audit.table(
  "events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    actorId: text("actor_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("events_event_type_idx").on(t.eventType),
    index("events_actor_created_idx").on(t.actorId, t.createdAt),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
