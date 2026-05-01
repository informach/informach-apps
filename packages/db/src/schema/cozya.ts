import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const cozya = pgSchema("cozya");

export const cozyaPlaceholderEntries = cozya.table("placeholder_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
