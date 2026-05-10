import {
  type AnyPgColumn,
  date,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const agenda = pgSchema("agenda");

export const agendaPlaceholderEntries = agenda.table("placeholder_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ----- Reference data: IBGE states + cities + INEP schools -----

export const agendaStates = agenda.table("states", {
  uf: text("uf").primaryKey(),
  ibgeCode: text("ibge_code").notNull().unique(),
  name: text("name").notNull(),
});

export const agendaCities = agenda.table(
  "cities",
  {
    ibgeCode: text("ibge_code").primaryKey(),
    stateUf: text("state_uf")
      .notNull()
      .references(() => agendaStates.uf),
    name: text("name").notNull(),
  },
  (t) => [index("agenda_cities_state_name_idx").on(t.stateUf, t.name)],
);

export const agendaSchools = agenda.table(
  "schools",
  {
    inepCode: text("inep_code").primaryKey(),
    cityIbgeCode: text("city_ibge_code")
      .notNull()
      .references(() => agendaCities.ibgeCode),
    name: text("name").notNull(),
  },
  (t) => [index("agenda_schools_city_name_idx").on(t.cityIbgeCode, t.name)],
);

// ----- Turmas (shared across accounts) -----

export const agendaTurmas = agenda.table(
  "turmas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    schoolInepCode: text("school_inep_code")
      .notNull()
      .references(() => agendaSchools.inepCode),
    grade: text("grade", {
      enum: ["1ano", "2ano", "3ano", "4ano", "5ano", "6ano", "7ano", "8ano", "9ano"],
    }).notNull(),
    year: integer("year").notNull(),
    classLetter: text("class_letter").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_turmas_natural_key_idx").on(
      t.schoolInepCode,
      t.grade,
      t.year,
      t.classLetter,
    ),
  ],
);

export const agendaStudentProfiles = agenda.table(
  "student_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    birthDate: date("birth_date").notNull(),
    activeTurmaId: uuid("active_turma_id").references((): AnyPgColumn => agendaTurmas.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agenda_student_profiles_user_created_idx").on(t.userId, t.createdAt)],
);

export const agendaTurmaMembers = agenda.table(
  "turma_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => agendaTurmas.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_turma_members_unique_idx").on(t.turmaId, t.studentProfileId),
    index("agenda_turma_members_profile_idx").on(t.studentProfileId),
  ],
);

export type AgendaState = typeof agendaStates.$inferSelect;
export type AgendaCity = typeof agendaCities.$inferSelect;
export type AgendaSchool = typeof agendaSchools.$inferSelect;
export type AgendaTurma = typeof agendaTurmas.$inferSelect;
export type NewAgendaTurma = typeof agendaTurmas.$inferInsert;
export type AgendaTurmaMember = typeof agendaTurmaMembers.$inferSelect;
export type NewAgendaTurmaMember = typeof agendaTurmaMembers.$inferInsert;
export type AgendaStudentProfile = typeof agendaStudentProfiles.$inferSelect;
export type NewAgendaStudentProfile = typeof agendaStudentProfiles.$inferInsert;
