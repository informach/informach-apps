import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  pgSchema,
  smallint,
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

// Matérias pertencem à turma (compartilhadas entre famílias). Só o creator da
// turma edita/exclui — checagem é no service. UNIQUE (turma_id, name) impede
// duplicata exata na mesma turma.
export const agendaSubjects = agenda.table(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => agendaTurmas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    teacherName: text("teacher_name"),
    // Cor visual atribuída no momento do INSERT, 1..5 (chart-1..chart-5).
    // Escolha free-of-collision por turma feita no repository sob pg_advisory_xact_lock.
    colorIndex: smallint("color_index").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_subjects_turma_name_unique_idx").on(t.turmaId, t.name),
    index("agenda_subjects_turma_idx").on(t.turmaId),
  ],
);

// Atividades (tarefa/prova/trabalho/lembrete) pertencem à turma. Status é
// individual por perfil (tabela separada) — uma atividade compartilhada não
// tem "status global", cada perfil de cada família tem o seu próprio rastro.
// Edit/delete só pelo criador; bloqueado quando outra família já aceitou.
export const agendaActivities = agenda.table(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turmaId: uuid("turma_id")
      .notNull()
      .references(() => agendaTurmas.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => agendaSubjects.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", {
      enum: ["task", "exam", "project", "reminder"],
    }).notNull(),
    visibility: text("visibility", {
      enum: ["individual", "shared_with_turma"],
    })
      .notNull()
      .default("individual"),
    title: text("title").notNull(),
    description: text("description"),
    // Só a data (sem hora nem timezone) — atividades escolares são "entrega no
    // dia X". Drizzle mode default devolve string "YYYY-MM-DD", igual
    // student_profiles.birthDate.
    dueAt: date("due_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agenda_activities_turma_due_idx").on(t.turmaId, t.dueAt),
    index("agenda_activities_creator_due_idx").on(t.createdByUserId, t.dueAt),
    // Suporta `isSubjectInUseByOtherUsers` no service de matérias.
    index("agenda_activities_subject_idx").on(t.subjectId),
  ],
);

// Status individual por perfil. Quando a atividade é criada, geramos uma row
// por perfil ativo do criador na turma. Quando outro usuário Pro aceita a
// atividade compartilhada, geramos rows pros perfis ativos dele na turma.
// `done` é terminal mas reversível (user pode marcar como pending de novo).
export const agendaActivityStatuses = agenda.table(
  "activity_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => agendaActivities.id, { onDelete: "cascade" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "done"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_activity_statuses_unique_idx").on(t.activityId, t.studentProfileId),
    index("agenda_activity_statuses_profile_idx").on(t.studentProfileId, t.status),
  ],
);

// Aceite/rejeite de atividade compartilhada por outro user (não-creator) da
// turma. O criador NÃO tem row aqui — aceite implícito. `accepted=true`
// gera status rows pros perfis ativos do user; `accepted=false` apenas
// silencia o widget de aceitação no dashboard.
export const agendaActivityAcceptances = agenda.table(
  "activity_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => agendaActivities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accepted: boolean("accepted").notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_activity_acceptances_unique_idx").on(t.activityId, t.userId),
    index("agenda_activity_acceptances_user_idx").on(t.userId, t.accepted),
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
export type AgendaSubject = typeof agendaSubjects.$inferSelect;
export type NewAgendaSubject = typeof agendaSubjects.$inferInsert;
export type AgendaActivity = typeof agendaActivities.$inferSelect;
export type NewAgendaActivity = typeof agendaActivities.$inferInsert;
export type AgendaActivityStatus = typeof agendaActivityStatuses.$inferSelect;
export type NewAgendaActivityStatus = typeof agendaActivityStatuses.$inferInsert;
export type AgendaActivityAcceptance = typeof agendaActivityAcceptances.$inferSelect;
export type NewAgendaActivityAcceptance = typeof agendaActivityAcceptances.$inferInsert;
