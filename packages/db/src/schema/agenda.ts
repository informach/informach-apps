import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const agenda = pgSchema("agenda");

export const agendaPlaceholderEntries = agenda.table("placeholder_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
