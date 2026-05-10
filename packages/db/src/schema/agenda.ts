import { date, index, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";

export const agenda = pgSchema("agenda");

export const agendaPlaceholderEntries = agenda.table("placeholder_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agendaStudentProfiles = agenda.table(
  "student_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    birthDate: date("birth_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agenda_student_profiles_user_created_idx").on(t.userId, t.createdAt)],
);

export type AgendaStudentProfile = typeof agendaStudentProfiles.$inferSelect;
export type NewAgendaStudentProfile = typeof agendaStudentProfiles.$inferInsert;
